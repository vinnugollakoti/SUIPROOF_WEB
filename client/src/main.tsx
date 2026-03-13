import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider,
} from '@mysten/dapp-kit'
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc'
import '@mysten/dapp-kit/dist/index.css'
import './index.css'
import App from './App.tsx'

const { networkConfig } = createNetworkConfig({
  mainnet: { network: 'mainnet', url: getJsonRpcFullnodeUrl('mainnet') },
  testnet: { network: 'testnet', url: getJsonRpcFullnodeUrl('testnet') },
  devnet: { network: 'devnet', url: getJsonRpcFullnodeUrl('devnet') },
})
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </StrictMode>,
)
