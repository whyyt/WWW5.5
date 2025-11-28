'use client';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import EventList from '@/components/EventList';
import { useWriteContract, useAccount, useReadContract } from 'wagmi';
import { MOCK_USDT_ADDRESS, COURTSIDE_ADDRESS } from '@/constants';
import CourtsideABI from '@/abi/Courtside.json';
import { parseEther } from 'viem';

const ERC20ABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "to", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "mint",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
] as const;

export default function Home() {
  const { address } = useAccount();
  const { data: owner } = useReadContract({
      address: COURTSIDE_ADDRESS as `0x${string}`,
      abi: CourtsideABI.abi as any,
      functionName: 'owner',
  });

  const isOwner = !!(address && owner && address === (owner as string));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-8 font-[family-name:var(--font-geist-sans)]">
      <header className="flex justify-between items-center mb-12 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-emerald-600 flex items-center gap-2">
          🏸 <span className="bg-gradient-to-r from-emerald-600 to-blue-500 bg-clip-text text-transparent">BadmintonTribe</span>
        </h1>
        <div className="flex gap-4 items-center">
          {isOwner && (
              <Link href="/admin" className="px-4 py-2 rounded-xl border border-emerald-500 bg-white text-emerald-600 hover:bg-emerald-50 font-semibold transition-all duration-200 flex items-center shadow-sm">
                  Admin Panel
              </Link>
          )}
          <Link href="/profile" className="px-4 py-2 rounded-xl bg-transparent text-slate-600 hover:text-emerald-600 hover:bg-slate-100 font-semibold transition-all duration-200 flex items-center">
            My Profile
          </Link>
          <Link 
            href="/create"
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-md hover:shadow-lg transition-all duration-200 flex items-center"
          >
            + Create Event
          </Link>
          <div className="rounded-xl overflow-hidden shadow-sm transition-all duration-200">
            <ConnectButton showBalance={false} />
          </div>
        </div>
      </header>
      
      {/* Faucet for Testing */}
      <div className="max-w-4xl mx-auto mb-8 p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-center justify-between shadow-sm">
          <span className="text-orange-600 text-sm font-medium">🧪 Testnet Mode: Need Mock USDT?</span>
          <MintButton />
      </div>

      <main className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Information</h2>
        <div className="p-8 rounded-3xl bg-white border border-slate-100 shadow-sm">
          <p className="text-slate-500 mb-8">
            Welcome to the decentralized badminton event manager. 
            Join a game, meet new friends, and play on court!
          </p>
          <EventList />
        </div>
      </main>
    </div>
  );
}

function MintButton() {
    const { address } = useAccount();
    const { writeContract, isPending } = useWriteContract();

    if (!address) return null;

    return (
        <button 
            onClick={() => writeContract({
                address: MOCK_USDT_ADDRESS,
                abi: ERC20ABI,
                functionName: 'mint',
                args: [address, parseEther('1000')]
            })}
            disabled={isPending}
            className="px-3 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 text-xs rounded-lg uppercase font-bold tracking-wider transition"
        >
            {isPending ? 'Minting...' : 'Mint 1000 USDT'}
        </button>
    )
}
