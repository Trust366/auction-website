import React from "react";
import { RiAuctionFill } from "react-icons/ri";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";

const UpcomingAuctions = () => {
  const { allAuctions } = useSelector((state) => state.auction);

  const today = new Date();
  const todayString = today.toDateString();

  const auctionsStartingToday = allAuctions?.filter((item) => {
    const auctionDate = new Date(item.startTime);
    return auctionDate.toDateString() === todayString;
  }) || [];

  return (
    <>
      <section className="my-8">
        <h3 className="text-[#111] text-xl font-semibold mb-2 min-[480px]:text-xl md:text-2xl lg:text-3xl">
          Auctions For Today
        </h3>
        <div className="flex flex-wrap gap-6">
          {auctionsStartingToday.length > 0 ? (
            auctionsStartingToday.map((auction) => (
              <div
                key={auction._id}
                className="bg-[#161613] w-full p-2 gap-10 rounded-md flex flex-col justify-between lg:flex-1 lg:h-auto lg:p-6 2xl:flex-none 2xl:basis-64 2xl:flex-grow 2xl:px-2 2xl:py-6"
              >
                <span className="rounded-full bg-[#fdba88] text-white w-fit p-3">
                  <RiAuctionFill />
                </span>
                <div>
                  <h3 className="text-[#fdba88] text-xl font-semibold mb-2 min-[480px]:text-xl md:text-2xl lg:text-3xl">
                    {auction.title}
                  </h3>
                  <p className="text-white mb-2">
                    Starts at: {new Date(auction.startTime).toLocaleTimeString()}
                  </p>
                  <Link
                    to={`/auction/${auction._id}`}
                    className="text-sm text-[#fdba88] underline"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <p className="text-white text-lg">No auctions starting today.</p>
          )}
        </div>
      </section>
    </>
  );
};

export default UpcomingAuctions;
