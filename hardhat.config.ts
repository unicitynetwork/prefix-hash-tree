import '@nomicfoundation/hardhat-toolbox';

interface NetworkConfig {
  url?: string;
  chainId?: number;
}

interface Networks {
  [key: string]: NetworkConfig;
}

const networks: Networks = {
  hardhat: {
    chainId: 31337
  },
  localnet: {
    url: 'http://127.0.0.1:8545'
  }
};

export default {
  mocha: {
    timeout: 1200000,
  },
  networks,
};