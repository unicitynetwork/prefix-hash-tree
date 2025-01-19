require("@nomicfoundation/hardhat-toolbox");

let networks = { // predefined network conf for local dev net
    hardhat: {
    chainId: 31337
    },
    localnet: {
    url: "http://127.0.0.1:8545"
    }
}

module.exports = {
    mocha: {
	timeout: 600000, // Set timeout to 60 seconds (default is 2000ms)
    },
    networks,
}