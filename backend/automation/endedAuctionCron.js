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
    console.log("⏰ Cron is running...");

    try {
      const endedAuctions = await Auction.find({
        endTime: { $lt: now },
        commissionCalculated: false,
      });

      if (endedAuctions.length === 0) {
        console.log("📭 No ended auctions found.");
        return;
      }

      for (const auction of endedAuctions) {
        console.log(`⚙️ Processing auction: ${auction.title} (${auction._id})`);

        try {
          const highestBid = auction.bids?.sort((a, b) => b.amount - a.amount)[0];

          if (!highestBid || !highestBid.userId) {
            console.log(`❗ No valid highest bid found for auction ${auction._id}`);
            auction.commissionCalculated = true; // Prevent retry
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

          const commissionAmount = await calculateCommission(auction._id);
          auction.commissionCalculated = true;
          auction.highestBidder = bidder._id;
          await auction.save();

          console.log("🏅 Highest bidder set and commission calculated.");

          await User.findByIdAndUpdate(
            bidder._id,
            {
              $inc: {
                moneySpent: highestBid.amount,
                auctionsWon: 1,
              },
            }
          );

          await User.findByIdAndUpdate(
            auctioneer._id,
            {
              $inc: {
                unpaidCommission: commissionAmount,
              },
            }
          );

          const auctioneerMessage = `
Dear ${auctioneer.userName},

The auction for **${auction.title}** has ended.
Your commission is: **₦${commissionAmount}**.

Please send payment to:
- ${process.env.PLATFORM_ACCOUNT_NAME}
- ${process.env.PLATFORM_ACCOUNT_EMAIL}
- ${process.env.PLATFORM_ACCOUNT_BANK}
- ${process.env.PLATFORM_ACCOUNT_NUMBER}

Thanks,
Trustys Auction Team`;

          const bidderMessage = `
Dear ${bidder.userName},

You won the auction: **${auction.title}** 🎉

Contact the auctioneer: ${auctioneer.email}

To pay:
- Bank: ${auctioneer.paymentMethods.bankTransfer?.bankName}
- Account Name: ${auctioneer.paymentMethods.bankTransfer?.bankAccountName}
- Number: ${auctioneer.paymentMethods.bankTransfer?.bankAccountNumber}

You can also pay 20% upfront for COD.

Trustys Auction Team`;

          await sendEmail({
            email: auctioneer.email,
            subject: `🎉 Auction ${auction.title} Ended - Commission Info`,
            message: auctioneerMessage,
          });

          console.log("✅ Email sent to auctioneer:", auctioneer.email);

          await sendEmail({
            email: bidder.email,
            subject: `🎉 You won the auction for ${auction.title}`,
            message: bidderMessage,
          });

          console.log("✅ Email sent to bidder:", bidder.email);
        } catch (innerErr) {
          console.error("❌ Error processing auction:", auction.title, innerErr.message || innerErr);
        }
      }
    } catch (err) {
      console.error("❌ Cron job error:", err.message || err);
    }
  });
};
