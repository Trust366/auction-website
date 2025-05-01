import {config} from "dotenv"
import express from "express";
import cors from "cors"
import cookieParser from "cookie-parser";
import fileUpload from "express-fileupload";
import { connection } from "./database/connection.js";
import { errorMiddleware } from "./middleware/error.js";
import userRouter from "./routes/userRoutes.js"
import auctionItemRouter from "./routes/auctionItemRoutes.js"
import bidRouter from "./routes/bidRoutes.js"
import commissionRouter from "./routes/commissionRouter.js"
import superAdminRouter from "./routes/superAdminRoutes.js"
import { endedAuctionCron } from "./automation/endedAuctionCron.js";
import { verifyCommissionCron } from "./automation/verifyCommissionCron.js";
const app = express()
config({
    path: "./config/config.env"
})

app.use(cors({
    origin: [process.env.FRONTEND_URL],
    methods: ["POST", "GET", "PUT", "DELETE"],
    credentials: true
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({extended:true}))
app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/"

}));

app.use("/api/v1/user", userRouter);
app.use("/api/v1/auctionItem", auctionItemRouter);
app.use("/api/v1/bid", bidRouter);
app.use("/api/v1/commission", commissionRouter)
app.use("/api/v1/superadmin", superAdminRouter)
endedAuctionCron();
verifyCommissionCron();
connection();
app.use(errorMiddleware);
export default app 