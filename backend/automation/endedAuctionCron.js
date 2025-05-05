import dotenv from "dotenv";
dotenv.config({ path: "./config/config.env" });

import cron from "node-cron";
import moment from "moment-timezone";
import { Auction } from "../models/auctionSchema.js";
import { User } from "../models/userSchema.js";
import { Bid } from "../models/bidSchema.js";
import { sendEmail } from "../utils/sendEmail.js";
import { calculateCommission } from "../controllers/commissionController.js";

export const endedAuctionCron = () => {
  cron.schedule("*/1 * * * *", async () => {
    const nowLagos = moment().tz("Africa/Lagos").toDate();
    console.log("🕒 [CRON] Current Lagos time:", nowLagos.toISOString());

    try {
      const endedAuctions = await Auction.find({
        endTime: { $lt: nowLagos },
        commissionCalculated: false,
      });

      console.log(`🔍 Found ${endedAuctions.length} auctions that ended.`);

      for (const auction of endedAuctions) {
        console.log(`⚙️ Processing auction: ${auction.title}`);
        console.log(`⏳ Auction "${auction.title}" Ended At: ${auction.endTime.toISOString()}`);

        try {
          const commissionAmount = await calculateCommission(auction._id);
          auction.commissionCalculated = true;

          const highestBidder = await Bid.findOne({ auctionItem: auction._id }).sort({ amount: -1 });

          if (!highestBidder || !highestBidder.bidder || !highestBidder.bidder.id) {
            console.log(`❗ No valid highest bidder found for auction ID: ${auction._id}`);
            await auction.save();
            continue;
          }

          const bidder = await User.findById(highestBidder.bidder.id);
          const auctioneer = await User.findById(auction.createdBy);

          if (!bidder || !auctioneer) {
            console.log("❗ Bidder or auctioneer not found.");
            await auction.save();
            continue;
          }

          auction.highestBidder = bidder._id;
          await auction.save();

          await User.findByIdAndUpdate(
            bidder._id,
            {
              $inc: {
                moneySpent: highestBidder.amount,
                auctionsWon: 1,
              },
            },
            { new: true }
          );

          await User.findByIdAndUpdate(
            auctioneer._id,
            {
              $inc: {
                unpaidCommission: commissionAmount,
              },
            },
            { new: true }
          );

          const auctioneerSubject = `🎉 Auction ${auction.title} Ended - Commission Details`;
          const auctioneerMessage = `
Dear ${auctioneer.userName},

Congratulations! The auction for **${auction.title}** has ended, and the commission has been calculated.

Below are the details for your commission payment:

**Commission Amount:** ${commissionAmount}

**Platform Account Details:**
- Account Name: ${process.env.PLATFORM_ACCOUNT_NAME}
- Email: ${process.env.PLATFORM_ACCOUNT_EMAIL}
- Bank: ${process.env.PLATFORM_ACCOUNT_BANK}
- Account Number: ${process.env.PLATFORM_ACCOUNT_NUMBER}

Please process the payment at your earliest convenience.

Best regards,  
- Trustys Auction Team`;

          console.log("📧 Sending email to auctioneer:", auctioneer.email);

          try {
            await sendEmail({
              email: auctioneer.email,
              subject: auctioneerSubject,
              message: auctioneerMessage,
            });
            console.log("✅ Email sent successfully to auctioneer.");
          } catch (emailErr) {
            console.error("❌ Failed to send email to auctioneer:", emailErr.message || emailErr);
          }

          const subject = `🎉 Congratulations! You won the auction for ${auction.title}`;
          const message = `Dear ${bidder.userName},

Congratulations! You have won the auction for **${auction.title}**.

Before proceeding for payment, contact your auctioneer at: **${auctioneer.email}**

Please complete your payment using one of the following methods:

**Bank Transfer**:
- Account Name: ${auctioneer.paymentMethods.bankTransfer?.bankAccountName}
- Account Number: ${auctioneer.paymentMethods.bankTransfer?.bankAccountNumber}
- Bank: ${auctioneer.paymentMethods.bankTransfer?.bankName}

**Cash on Delivery (COD)**:
- Pay 20% upfront using any method above.
- The remaining 80% is paid upon delivery.

Need to see the item condition? Contact: ${auctioneer.email}

Make your payment by [Payment Due Date]. Once confirmed, your item will be shipped.

Thanks for bidding!

- Trustys Auction Team`;

          console.log("📧 Sending email to bidder:", bidder.email);

          try {
            await sendEmail({ email: bidder.email, subject, message });
            console.log("✅ Email sent successfully to bidder.");
          } catch (emailErr) {
            console.error("❌ Failed to send email to bidder:", emailErr.message || emailErr);
          }
        } catch (auctionErr) {
          console.error("❌ Error processing auction:", auctionErr);
        }
      }
    } catch (cronErr) {
      console.error("❌ Error running auction cron job:", cronErr);
    }
  });
};
