// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract LAXMockOracle {
    mapping(address => uint256) public prices;

    function setAssetPrice(address asset, uint256 price) external {
        prices[asset] = price;
    }

    function getAssetPrice(address asset) external view returns (uint256) {
        uint256 p = prices[asset];
        if (p == 0) return 100000000; // default $1.00 USDC with 8-dec
        return p;
    }

    function getSourceOfAsset(address) external pure returns (address) {
        return address(0);
    }
}