/**
 * BlockscoutAdapter - Translates Blockscout API v2 responses to legacy Teloscan v1 format
 * This allows the wallet to use Blockscout without rewriting all response handlers
 */

import { AxiosInstance } from 'axios';

// Blockscout v2 response types
export interface BlockscoutStats {
    average_block_time: number;
    coin_price: string;
    total_blocks: string;
    total_transactions: string;
    total_addresses: string;
    // ... other fields
}

export interface BlockscoutTokenHolder {
    address: {
        hash: string;
        name: string | null;
        is_contract: boolean;
    };
    value: string;
    token_id: string | null;
}

export interface BlockscoutToken {
    address_hash: string;
    name: string;
    symbol: string;
    decimals: string;
    type: string;
    holders_count: string;
    total_supply: string;
    icon_url: string | null;
    exchange_rate: string | null;
}

export interface BlockscoutAddressToken {
    token: BlockscoutToken;
    value: string;
    token_id: string | null;
}

export interface BlockscoutSmartContract {
    address_hash: string;
    name: string | null;
    abi: unknown[] | null;
    source_code: string | null;
    is_verified: boolean;
}

export interface BlockscoutNFTInstance {
    id: string;
    metadata: Record<string, unknown> | null;
    owner: { hash: string } | null;
    image_url: string | null;
    token: BlockscoutToken;
}

// Legacy Teloscan v1 format adapters
export interface LegacyHealthResponse {
    success: boolean;
    blockNumber: number;
    blockTimestamp: string;
    secondsBehind: number;
    version: string;
}

export interface LegacyTokenBalance {
    contract: string;
    balance: string;
}

export interface LegacyBalancesResponse {
    results: LegacyTokenBalance[];
    contracts: Record<string, {
        address: string;
        name: string;
        symbol: string;
        decimals: number;
        calldata?: {
            price?: number;
            marketdata_updated?: number;
        };
    }>;
}

export interface LegacyTokenHolder {
    address: string;
    balance: string;
    tokenId?: string;
}

export interface LegacyTokenHoldersResponse {
    results: LegacyTokenHolder[];
}

export interface LegacyContractResponse {
    address: string;
    name: string | null;
    abi: unknown[] | null;
    verified: boolean;
    supportedInterfaces?: string[];
    calldata?: unknown;
}

/**
 * Adapter class to translate Blockscout v2 API to legacy v1 format
 */
export class BlockscoutAdapter {
    private indexer: AxiosInstance;

    constructor(indexer: AxiosInstance) {
        this.indexer = indexer;
    }

    /**
     * Health check - /v1/health → /api/v2/stats
     */
    async getHealth(): Promise<LegacyHealthResponse> {
        try {
            const response = await this.indexer.get('/api/v2/stats');
            const stats = response.data as BlockscoutStats;
            
            return {
                success: true,
                blockNumber: parseInt(stats.total_blocks) || 0,
                blockTimestamp: new Date().toISOString(),
                secondsBehind: 0, // Blockscout doesn't provide this directly
                version: 'blockscout-v2',
            };
        } catch (error) {
            return {
                success: false,
                blockNumber: 0,
                blockTimestamp: '',
                secondsBehind: Number.POSITIVE_INFINITY,
                version: 'blockscout-v2',
            };
        }
    }

    /**
     * Token balances - /v1/account/{addr}/balances → /api/v2/addresses/{addr}/tokens
     */
    async getBalances(account: string, params?: { limit?: number; offset?: number }): Promise<LegacyBalancesResponse> {
        const response = await this.indexer.get(`/api/v2/addresses/${account}/tokens`, {
            params: { type: 'ERC-20', ...params },
        });
        
        const items = response.data.items as BlockscoutAddressToken[];
        const results: LegacyTokenBalance[] = [];
        const contracts: LegacyBalancesResponse['contracts'] = {};

        for (const item of items) {
            results.push({
                contract: item.token.address_hash,
                balance: item.value,
            });

            contracts[item.token.address_hash] = {
                address: item.token.address_hash,
                name: item.token.name,
                symbol: item.token.symbol,
                decimals: parseInt(item.token.decimals) || 18,
                calldata: item.token.exchange_rate ? {
                    price: parseFloat(item.token.exchange_rate),
                    marketdata_updated: Date.now(),
                } : undefined,
            };
        }

        return { results, contracts };
    }

    /**
     * Token holders - /v1/token/{addr}/holders → /api/v2/tokens/{addr}/holders
     */
    async getTokenHolders(
        contractAddress: string,
        params?: { limit?: number; account?: string; token_id?: string }
    ): Promise<LegacyTokenHoldersResponse> {
        const response = await this.indexer.get(`/api/v2/tokens/${contractAddress}/holders`, {
            params,
        });
        
        const items = response.data.items as BlockscoutTokenHolder[];
        
        // If filtering by account, filter the results
        let filteredItems = items;
        if (params?.account) {
            filteredItems = items.filter(
                item => item.address.hash.toLowerCase() === params.account?.toLowerCase()
            );
        }

        const results: LegacyTokenHolder[] = filteredItems.map(item => ({
            address: item.address.hash,
            balance: item.value,
            tokenId: item.token_id || undefined,
        }));

        return { results };
    }

    /**
     * Contract info - /v1/contract/{addr} → /api/v2/smart-contracts/{addr}
     */
    async getContract(address: string, params?: { full?: boolean; includeAbi?: boolean }): Promise<LegacyContractResponse> {
        try {
            const response = await this.indexer.get(`/api/v2/smart-contracts/${address}`);
            const contract = response.data as BlockscoutSmartContract;
            
            return {
                address: contract.address_hash,
                name: contract.name,
                abi: params?.includeAbi ? contract.abi : null,
                verified: contract.is_verified,
                supportedInterfaces: [], // Blockscout doesn't provide this directly
            };
        } catch (error) {
            // Contract might not be verified or might not exist
            return {
                address,
                name: null,
                abi: null,
                verified: false,
            };
        }
    }

    /**
     * Account NFTs - /v1/account/{addr}/nfts → /api/v2/addresses/{addr}/nft
     */
    async getAccountNfts(account: string, params?: { type?: string; limit?: number; offset?: number }) {
        const nftType = params?.type === 'ERC721' ? 'ERC-721' : params?.type === 'ERC1155' ? 'ERC-1155' : undefined;
        
        const response = await this.indexer.get(`/api/v2/addresses/${account}/nft`, {
            params: { type: nftType, ...params },
        });
        
        return this.transformNftResponse(response.data.items || []);
    }

    /**
     * Collection NFTs - /v1/contract/{addr}/nfts → /api/v2/tokens/{addr}/instances
     */
    async getCollectionNfts(contractAddress: string, params?: { limit?: number; offset?: number }) {
        const response = await this.indexer.get(`/api/v2/tokens/${contractAddress}/instances`, {
            params,
        });
        
        return this.transformNftResponse(response.data.items || [], contractAddress);
    }

    /**
     * Transform Blockscout NFT response to legacy format
     */
    private transformNftResponse(items: BlockscoutNFTInstance[], contractOverride?: string) {
        const results = items.map(item => ({
            tokenId: item.id,
            contract: contractOverride || item.token?.address_hash || '',
            metadata: JSON.stringify(item.metadata || {}),
            imageCache: item.image_url || '',
            tokenUri: '',
            owner: item.owner?.hash || '',
            updated: Date.now(),
            supply: '1', // Default for ERC721, ERC1155 would need separate handling
        }));

        // Build contracts map
        const contracts: Record<string, LegacyContractResponse> = {};
        for (const item of items) {
            if (item.token && !contracts[item.token.address_hash]) {
                contracts[item.token.address_hash] = {
                    address: item.token.address_hash,
                    name: item.token.name,
                    abi: null,
                    verified: false,
                    supportedInterfaces: [item.token.type?.toLowerCase().replace('-', '') || 'erc721'],
                };
            }
        }

        return { results, contracts };
    }

    /**
     * Transactions - /v1/address/{addr}/transactions → /api/v2/addresses/{addr}/transactions
     */
    async getTransactions(address: string, params?: { limit?: number; offset?: number }) {
        const response = await this.indexer.get(`/api/v2/addresses/${address}/transactions`, {
            params,
        });
        
        // Transform to legacy format - this is a simplified version
        return {
            results: response.data.items || [],
            contracts: {},
            total: response.data.items?.length || 0,
        };
    }

    /**
     * Token transfers - /v1/account/{addr}/transfers → /api/v2/addresses/{addr}/token-transfers
     */
    async getTokenTransfers(account: string, params?: { type?: string; limit?: number; offset?: number }) {
        const response = await this.indexer.get(`/api/v2/addresses/${account}/token-transfers`, {
            params,
        });
        
        return {
            results: response.data.items || [],
            contracts: {},
        };
    }

    /**
     * Approvals - No direct Blockscout equivalent
     * Workaround: Query Approval events from logs
     * Note: This is limited and may not catch all approvals
     */
    async getApprovals(account: string, params?: { type?: string }) {
        // Blockscout doesn't have a dedicated approvals endpoint
        // We'd need to either:
        // 1. Query logs for Approval events (complex, requires parsing)
        // 2. Use on-chain calls to check allowances (slow)
        // 3. Keep the old indexer running just for approvals
        
        console.warn('Approvals endpoint not available in Blockscout - returning empty results');
        return {
            results: [],
            contracts: {},
        };
    }
}

export default BlockscoutAdapter;
