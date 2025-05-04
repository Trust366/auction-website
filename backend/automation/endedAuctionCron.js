import dotenv from "dotenv";
dotenv.config({ path: "./config/config.env" });

import cron from "node-cron";
import { Auction } from "../models/auctionSchema.js";
import { User } from "../models/userSchema.js";
import { sendEmail } from "../utils/sendEmail.js";
import { calculateCommission } from "../controllers/commissionController.js";

export const endedAuctionCron = () => {
  cron.schedule("*/1 * * * *", async () => {
    const now = new Date();
    console.log("⏰ Cron job started at", now.toISOString());

    try {
      const endedAuctions = await Auction.find({
        endTime: { $lt: now },
        commissionCalculated: false,
      }).populate("bids"); // Ensure we have bid details

      if (endedAuctions.length === 0) {
        console.log("✅ No auctions to process right now.");
        return;
      }

      console.log(`🔍 Found ${endedAuctions.length} auctions to process.`);

      for (const auction of endedAuctions) {
        console.log(`⚙️ Processing auction: ${auction.title} (${auction._id})`);

        try {
          const commissionAmount = await calculateCommission(auction._id);
          console.log(`💰 Commission calculated: ${commissionAmount}`);

          // Sort bids by highest amount
          const highestBid = auction.bids.sort((a, b) => b.amount - a.amount)[0];

          if (!highestBid || !highestBid.userId) {
            console.log(`❗ No valid highest bidder found for auction ID: ${auction._id}`);
            auction.commissionCalculated = true;
            await auction.save();
            continue;
          }

          const bidder = await User.findById(highestBid.userId);
          const auctioneer = await User.findById(auction.createdBy);

          if (!bidder || !auctioneer) {
            console.log("❗ Bidder or auctioneer not found.");
            auction.commissionCalculated = true;
            await auction.save();
            continue;
          }

          // Update auction
          auction.highestBidder = bidder._id;
          auction.commissionCalculated = true;
          await auction.save();
          console.log("✅ Auction updated with highest bidder and marked as commission calculated.");

          // Update bidder stats
          await User.findByIdAndUpdate(bidder._id, {
            $inc: {
              moneySpent: highestBid.amount,
              auctionsWon: 1,
            },
          });

          // Update auctioneer stats
          await User.findByIdAndUpdate(auctioneer._id, {
            $inc: {
              unpaidCommission: commissionAmount,
            },
          });

          // === Email to auctioneer ===
          const auctioneerSubject = `🎉 Auction ${auction.title} Ended - Commission Details`;

          const auctioneerMessage = `
Dear ${auctioneer.userName},

Congratulations! The auction for **${auction.title}** has ended, and the commission has been calculated.

**Commission Amount:** ${commissionAmount}

**Platform Account Details:**
- Account Name: ${process.env.PLATFORM_ACCOUNT_NAME}
- Email: ${process.env.PLATFORM_ACCOUNT_EMAIL}
- Bank: ${process.env.PLATFORM_ACCOUNT_BANK}
- Account Number: ${process.env.PLATFORM_ACCOUNT_NUMBER}
- Bank Account Name: ${process.env.PLATFORM_ACCOUNT_NAME_BANK}

Please process the payment at your earliest convenience.

Best regards,  
Trustys Auction Team
`;

          console.log("📧 Sending email to auctioneer:", auctioneer.email);
          await sendEmail({
            email: auctioneer.email,
            subject: auctioneerSubject,
            message: auctioneerMessage,
          });
          console.log("✅ Email sent to auctioneer.");

          // === Email to bidder ===
          const paymentDueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toDateString();

          const subject = `🎉 Congratulations! You won the auction for ${auction.title}`;
          const message = `
Dear ${bidder.userName},

Congratulations! You have won the auction for **${auction.title}**.

Before proceeding with payment, kindly contact the auctioneer: **${auctioneer.email}**

Payment methods:

**Bank Transfer**:
- Account Name: ${auctioneer.paymentMethods.bankTransfer?.bankAccountName}
- Account Number: ${auctioneer.paymentMethods.bankTransfer?.bankAccountNumber}
- Bank: ${auctioneer.paymentMethods.bankTransfer?.bankName}

**Cash on Delivery (COD)**:
- Pay 20% upfront using any method above.
- Remaining 80% is paid upon delivery.

Please complete your payment by **${paymentDueDate}** to confirm your order.

Thanks for using Trustys Auction!

- Trustys Auction Team
`;

          console.log("📧 Sending email to bidder:", bidder.email);
          await sendEmail({
            email: bidder.email,
            subject,
            message,
          });
          console.log("✅ Email sent to bidder.");
        } catch (auctionErr) {
          console.error("❌ Error processing individual auction:", auctionErr.message || auctionErr);
        }
      }
    } catch (cronErr) {
      console.error("❌ Error during cron execution:", cronErr.message || cronErr);
    }
  });
};
