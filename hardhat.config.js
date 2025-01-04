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
    networks,
}