'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
// PERF-03: type-only imports are erased at build time, so the wallets kit is
// not in the initial chunk. The module itself is loaded on first use (see
// `loadKit`), which keeps it off the home, marketplace and help routes where
// nobody connects a wallet.
import type { ISupportedWallet } from '@creit.tech/stellar-wallets-kit';
import { Networks } from '@stellar/stellar-sdk';

/**
 * The shape of the kit instance this provider uses.
 *
 * Declared here rather than imported because the package types were written
 * for its static class usage: importing the class as a type gives the static
 * side, on which `openModal`, `getAddress` and `signTransaction` do not exist.
 * The dynamic import is cast to this module shape once, at the boundary.
 */
type WalletKitInstance = {
  getAddress(): Promise<{ address: string }>;
  setWallet(id: string): void;
  openModal(options: {
    onWalletSelected: (option: ISupportedWallet) => Promise<void>;
  }): Promise<void>;
  signTransaction(
    xdr: string,
    options: { networkPassphrase: string }
  ): Promise<{ signedTxXdr: string }>;
};

type WalletKitModule = {
  StellarWalletsKit: new (options: {
    network: string;
    selectedWalletId?: string;
    modules: unknown;
  }) => WalletKitInstance;
  NETWORK_PASSPHRASE: { PUBLIC: string; TESTNET: string };
  allowAllModules: () => unknown;
};
import { toast } from 'sonner';

type WalletNetwork = 'testnet' | 'public';

interface StellarWalletContextType {
  publicKey: string | null;
  walletId: string | null;
  network: WalletNetwork;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction: (xdr: string, opts?: { networkPassphrase?: string }) => Promise<string>;
}

const StellarWalletContext = createContext<StellarWalletContextType | undefined>(undefined);

const LAST_WALLET_KEY = 'stellarLastWalletId';

export function StellarWalletProvider({ children }: { children: ReactNode }) {
  const [kit, setKit] = useState<WalletKitInstance | null>(null);
  const kitRef = useRef<WalletKitInstance | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const stellarNetwork = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet') as WalletNetwork;
  const network: WalletNetwork = stellarNetwork;

  /**
   * Loads the wallets kit on first use and memoises it.
   *
   * The kit pulls in every supported wallet's adapter (Freighter, xBull,
   * Lobstr, ...) plus the modal UI. None of that is needed to browse a
   * marketplace or read a release page, so it is fetched when the user
   * actually connects or restores a wallet, not when the app boots.
   */
  const loadKit = useCallback(async (): Promise<WalletKitInstance> => {
    if (kitRef.current) return kitRef.current;

    const kitModule =
      (await import('@creit.tech/stellar-wallets-kit')) as unknown as WalletKitModule;
    const { StellarWalletsKit: WalletsKit, NETWORK_PASSPHRASE, allowAllModules } = kitModule;
    const instance = new WalletsKit({
      network: network === 'public' ? NETWORK_PASSPHRASE.PUBLIC : NETWORK_PASSPHRASE.TESTNET,
      selectedWalletId: walletId || undefined,
      modules: allowAllModules(),
    });
    kitRef.current = instance;
    setKit(instance);
    return instance;
  }, [network, walletId]);

  useEffect(() => {
    const reconnect = async () => {
      const lastWallet = localStorage.getItem(LAST_WALLET_KEY);
      // Only a session that already connected a wallet pays for the kit.
      if (!lastWallet) return;

      try {
        setIsConnecting(true);
        const instance = await loadKit();
        const { address } = await instance.getAddress();
        setPublicKey(address);
        setWalletId(lastWallet);
      } catch (error) {
        localStorage.removeItem(LAST_WALLET_KEY);
      } finally {
        setIsConnecting(false);
      }
    };

    reconnect();
  }, [loadKit]);

  const connect = useCallback(async () => {
    try {
      setIsConnecting(true);
      const instance = await loadKit();
      await instance.openModal({
        onWalletSelected: async (option: ISupportedWallet) => {
          try {
            instance.setWallet(option.id);
            const { address } = await instance.getAddress();

            setPublicKey(address);
            setWalletId(option.id);
            localStorage.setItem(LAST_WALLET_KEY, option.id);

            toast.success(`Connected to ${option.name}`);
          } catch (error: any) {
            if (error?.message?.includes('User declined')) {
              toast.error('Connection rejected');
            } else if (error?.message?.includes('not installed')) {
              toast.error(`${option.name} wallet is not installed`);
            } else {
              toast.error('Failed to connect wallet');
            }
            throw error;
          }
        },
      });
    } catch (error) {
      toast.error('Could not load the wallet connector. Check your connection and try again.');
      console.error('Wallet connection error:', error);
    } finally {
      setIsConnecting(false);
    }
  }, [loadKit]);

  const disconnect = useCallback(() => {
    setPublicKey(null);
    setWalletId(null);
    localStorage.removeItem(LAST_WALLET_KEY);
    toast.info('Wallet disconnected');
  }, []);

  const signTransaction = useCallback(
    async (xdr: string, opts?: { networkPassphrase?: string }) => {
      if (!publicKey) {
        throw new Error('Wallet not connected');
      }

      const instance = kit ?? (await loadKit());

      const networkPassphrase =
        opts?.networkPassphrase || (network === 'public' ? Networks.PUBLIC : Networks.TESTNET);

      try {
        const { signedTxXdr } = await instance.signTransaction(xdr, {
          networkPassphrase,
        });
        return signedTxXdr;
      } catch (error: any) {
        if (error?.message?.includes('User declined')) {
          toast.error('Transaction rejected');
        } else {
          toast.error('Failed to sign transaction');
        }
        throw error;
      }
    },
    [kit, publicKey, network, loadKit]
  );

  return (
    <StellarWalletContext.Provider
      value={{
        publicKey,
        walletId,
        network,
        isConnecting,
        connect,
        disconnect,
        signTransaction,
      }}
    >
      {children}
    </StellarWalletContext.Provider>
  );
}

export function useStellarWallet() {
  const context = useContext(StellarWalletContext);
  if (context === undefined) {
    throw new Error('useStellarWallet must be used within a StellarWalletProvider');
  }
  return context;
}
