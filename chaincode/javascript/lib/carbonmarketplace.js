'use strict';

const { Contract } = require('fabric-contract-api');
const { v4: uuidv4 } = require('uuid'); // For generating unique IDs

class CarbonMarketplace extends Contract {
    async initLedger(ctx, governmentName, country, deptName) {
        console.info('Initializing ledger');

        // Government details stored in the ledger
        const governmentDetails = {
            governmentAddress: ctx.clientIdentity.getID(),
            governmentName: governmentName,
            country: country,
            deptName: deptName,
        };

        await ctx.stub.putState('governmentDetails', Buffer.from(JSON.stringify(governmentDetails)));

        console.info('Ledger initialized');
    }

    // --- NGO/Corporate Functions ---

    // Submit a carbon emission reduction project proposal
    async submitProposal(ctx, projectDescription, carbonReductionTarget) {
        const proposer = ctx.clientIdentity.getID();
        const proposalId = uuidv4(); // Unique ID for each proposal

        const projectProposal = {
            id: proposalId,
            proposer: proposer,
            projectDescription: projectDescription,
            carbonReductionTarget: parseInt(carbonReductionTarget),
            approved: false,
            allocatedCredits: 0,
        };

        await ctx.stub.putState('proposal_${proposalId}', Buffer.from(JSON.stringify(projectProposal)));
        return 'Project proposal ${proposalId} submitted by ${proposer}';
    }

    // --- Government Functions ---

    // Approve a project and allocate carbon credits
    async approveProject(ctx, proposalId, allocatedCredits) {
        const proposalAsBytes = await ctx.stub.getState('proposal_${proposalId}');
        if (!proposalAsBytes || proposalAsBytes.length === 0) {
            throw new Error('${proposalId} does not exist');
        }
        const proposal = JSON.parse(proposalAsBytes.toString());

        if (proposal.approved) {
            throw new Error('Project ${proposalId} already approved');
        }

        proposal.approved = true;
        proposal.allocatedCredits = parseInt(allocatedCredits);

        await ctx.stub.putState('proposal_${proposalId}', Buffer.from(JSON.stringify(proposal)));
        return 'Project ${proposalId} approved with ${allocatedCredits} carbon credits allocated';
    }

    // Mint carbon credits after successful project appraisal
    async issueCarbonCredits(ctx, proposalId) {
        const proposalAsBytes = await ctx.stub.getState('proposal_${proposalId}');
        if (!proposalAsBytes || proposalAsBytes.length === 0) {
            throw new Error('${proposalId} does not exist');
        }
        const proposal = JSON.parse(proposalAsBytes.toString());

        if (!proposal.approved) {
            throw new Error('Project ${proposalId} is not approved');
        }

        const proposer = proposal.proposer;
        const creditsToIssue = proposal.allocatedCredits;

        let existingCreditsAsBytes = await ctx.stub.getState(proposer);
        let existingCredits = 0;

        if (existingCreditsAsBytes && existingCreditsAsBytes.length > 0) {
            existingCredits = parseInt(existingCreditsAsBytes.toString());
        }

        const updatedCredits = existingCredits + creditsToIssue;
        await ctx.stub.putState(proposer, Buffer.from(updatedCredits.toString()));

        return 'Issued ${creditsToIssue} carbon credits to ${proposer}';
    }

    // --- Auction Functions ---

    // Create an auction for carbon credits (by the government)
    async createAuction(ctx, totalCredits, startingBid, auctionDuration) {
        const auctionId = uuidv4(); // Unique ID for the auction
        const auctionEndTime = Date.now() + parseInt(auctionDuration) * 1000; // Auction duration in seconds

        const auction = {
            id: auctionId,
            totalCredits: parseInt(totalCredits),
            startingBid: parseInt(startingBid),
            highestBid: 0,
            highestBidder: '',
            endTime: auctionEndTime,
            ended: false,
        };

        await ctx.stub.putState('auction_${auctionId}', Buffer.from(JSON.stringify(auction)));
        return 'Auction ${auctionId} created';
    }

    // Place a bid for a carbon credit auction
    async placeBid(ctx, auctionId, bidAmount) {
        const auctionAsBytes = await ctx.stub.getState('auction_${auctionId}');
        if (!auctionAsBytes || auctionAsBytes.length === 0) {
            throw new Error('Auction ${auctionId} does not exist');
        }
        const auction = JSON.parse(auctionAsBytes.toString());

        if (Date.now() > auction.endTime) {
            throw new Error('Auction ${auctionId} has ended');
        }

        const bidAmountInt = parseInt(bidAmount);
        if (bidAmountInt <= auction.highestBid || bidAmountInt < auction.startingBid) {
            throw new Error('Bid too low');
        }

        auction.highestBid = bidAmountInt;
        auction.highestBidder = ctx.clientIdentity.getID();

        await ctx.stub.putState('auction_${auctionId}', Buffer.from(JSON.stringify(auction)));
        return 'Bid of ${bidAmountInt} placed for auction ${auctionId}';
    }

    // End the auction and transfer carbon credits to the highest bidder
    async endAuction(ctx, auctionId) {
        const auctionAsBytes = await ctx.stub.getState('auction_${auctionId}');
        if (!auctionAsBytes || auctionAsBytes.length === 0) {
            throw new Error('Auction ${auctionId} does not exist');
        }
        const auction = JSON.parse(auctionAsBytes.toString());

        if (Date.now() < auction.endTime) {
            throw new Error('Auction ${auctionId} is still ongoing');
        }

        if (auction.ended) {
            throw new Error('Auction ${auctionId} already ended');
        }

        auction.ended = true;

        const highestBidder = auction.highestBidder;
        const creditsToTransfer = auction.totalCredits;

        let existingCreditsAsBytes = await ctx.stub.getState(highestBidder);
        let existingCredits = 0;

        if (existingCreditsAsBytes && existingCreditsAsBytes.length > 0) {
            existingCredits = parseInt(existingCreditsAsBytes.toString());
        }

        const updatedCredits = existingCredits + creditsToTransfer;
        await ctx.stub.putState(highestBidder, Buffer.from(updatedCredits.toString()));

        return 'Auction ${auctionId} ended. ${creditsToTransfer} carbon credits transferred to ${highestBidder}';
    }

    // --- Secondary Marketplace Functions ---

    // Create a sale for carbon credits (by companies)
    async createSale(ctx, creditsForSale, pricePerCredit) {
        const saleId = uuidv4(); // Unique sale ID
        const seller = ctx.clientIdentity.getID();

        let existingCreditsAsBytes = await ctx.stub.getState(seller);
        let existingCredits = 0;

        if (existingCreditsAsBytes && existingCreditsAsBytes.length > 0) {
            existingCredits = parseInt(existingCreditsAsBytes.toString());
        }

        if (existingCredits < parseInt(creditsForSale)) {
            throw new Error('Insufficient credits to sell');
        }

        const sale = {
            id: saleId,
            creditsForSale: parseInt(creditsForSale),
            pricePerCredit: parseInt(pricePerCredit),
            seller: seller,
            sold: false,
        };

        await ctx.stub.putState('sale_${saleId}', Buffer.from(JSON.stringify(sale)));
        return 'Sale ${saleId} created by ${seller}';
    }

    // Buy credits from the secondary marketplace
    async buyCredits(ctx, saleId, creditsToBuy) {
        const saleAsBytes = await ctx.stub.getState('sale_${saleId}');
        if (!saleAsBytes || saleAsBytes.length === 0) {
            throw new Error('Sale ${saleId} does not exist');
        }
        const sale = JSON.parse(saleAsBytes.toString());

        if (sale.sold) {
            throw new Error('Sale ${saleId} already completed');
        }

        const buyer = ctx.clientIdentity.getID();
        const creditsToBuyInt = parseInt(creditsToBuy);
        const totalCost = creditsToBuyInt * sale.pricePerCredit;

        let buyerCreditsAsBytes = await ctx.stub.getState(buyer);
        let buyerCredits = 0;

        if (buyerCreditsAsBytes && buyerCreditsAsBytes.length > 0) {
            buyerCredits = parseInt(buyerCreditsAsBytes.toString());
        }

        sale.creditsForSale -= creditsToBuyInt;

        await ctx.stub.putState(buyer, Buffer.from((buyerCredits + creditsToBuyInt).toString()));
        await ctx.stub.putState(sale.seller, Buffer.from((sale.seller + totalCost).toString()));

        if (sale.creditsForSale === 0) {
            sale.sold = true;
        }

        await ctx.stub.putState('sale_${saleId}', Buffer.from(JSON.stringify(sale)));
        return '${creditsToBuyInt} credits bought from sale ${saleId} by ${buyer}';
    }
}

module.exports = CarbonMarketplace;
