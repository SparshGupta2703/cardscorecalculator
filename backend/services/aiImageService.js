exports.generateRoyalCards = async (fileBuffer, username, pfpUrl) => {
  console.log(`Setting custom royal cards for ${username} using their normal profile photo...`);

  // Instantly maps your Cloudinary photo directly to Jack, Queen, King, and Ace
  // Bypasses all AI generation and rate limits for 100% reliability
  return {
    11: pfpUrl, // Jack
    12: pfpUrl, // Queen
    13: pfpUrl, // King
    14: pfpUrl  // Ace
  };
};