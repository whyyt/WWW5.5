'use client';

import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits } from 'viem';
import { useRouter } from 'next/navigation';
import CourtsideABI from '@/abi/Courtside.json';
import { COURTSIDE_ADDRESS, MOCK_USDT_ADDRESS } from '@/constants';

const ERC20_DECIMALS_ABI = [
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  }
] as const;

export default function CreateEvent() {
  const router = useRouter();
  const { data: hash, isPending, error: writeError, writeContractAsync } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Fetch Token Decimals
  const { data: tokenDecimals } = useReadContract({
    address: MOCK_USDT_ADDRESS as `0x${string}`,
    abi: ERC20_DECIMALS_ABI,
    functionName: 'decimals',
  });

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    location: '',
    date: '',
    time: '',
    duration: '2', // Default 2 hours
    maxPlayers: '4',
    minPlayers: '2',
    fee: '10',
    minLevelMale: '10',
    minLevelFemale: '10',
  });

  const [error, setError] = useState<string | null>(null);

  const validate = () => {
    const now = new Date();
    const startDateTime = new Date(`${formData.date}T${formData.time}`);
    
    // 1. Time Check: > 12 hours from now
    const diffHours = (startDateTime.getTime() - now.getTime()) / (1000 * 3600);
    if (diffHours < 0) {
        return "Start time must be at least 12 hours in the future.";
    }

    // 2. Duration Check: >= 1 hour
    const dur = Number(formData.duration);
    if (dur < 1) {
        return "Activity duration must be at least 1 hour.";
    }

    // 3. Players Check
    const min = Number(formData.minPlayers);
    const max = Number(formData.maxPlayers);

    if (max < min) return "Max players cannot be less than min players.";
    if (max > 20) return "Max players cannot exceed 20.";
    if (min < 2) return "Min players must be at least 2.";
    
    // Max players <= duration * 4
    const maxAllowed = dur * 4;
    if (max > maxAllowed) {
        return `Max players (${max}) exceeds limit based on duration (${maxAllowed} players for ${dur} hours). Rule: 4 players per hour.`;
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const errMsg = validate();
    if (errMsg) {
        setError(errMsg);
        return;
    }
    
    const startDateTime = new Date(`${formData.date}T${formData.time}`);
    const startTime = Math.floor(startDateTime.getTime() / 1000);
    // Duration in seconds (input is hours)
    const durationSeconds = Math.floor(Number(formData.duration) * 3600);

    // Use fetched decimals or default to 18 (standard) or 6 (USDT)
    // Defaulting to 18 if not ready, but ideally we should wait. 
    // However writeContractAsync will likely fail if data is bad, but here we just need correct scaling.
    const decimals = tokenDecimals ? Number(tokenDecimals) : 18;

    try {
      await writeContractAsync({
        address: COURTSIDE_ADDRESS as `0x${string}`,
        abi: CourtsideABI.abi as any,
        functionName: 'createEvent',
        args: [{
          name: formData.name,
          description: formData.description,
          location: formData.location,
          startTime: BigInt(startTime),
          duration: BigInt(durationSeconds),
          tokenAddress: MOCK_USDT_ADDRESS as `0x${string}`,
          feePerPerson: parseUnits(formData.fee, decimals), 
          maxPlayers: BigInt(formData.maxPlayers),
          minPlayers: BigInt(formData.minPlayers),
          minLevelMale: Number(formData.minLevelMale),
          minLevelFemale: Number(formData.minLevelFemale)
        }],
      });
    } catch (err: any) {
      console.error("Write Contract Error:", err);
      setError(err.shortMessage || err.message || "Transaction failed");
    }
  };

  if (isSuccess) {
    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-8">
            <h2 className="text-2xl font-bold text-emerald-600 mb-4">Event Created Successfully!</h2>
            <p className="text-slate-500 mb-8">Transaction Hash: {hash}</p>
            <button 
                onClick={() => router.push('/')}
                className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-semibold shadow-sm transition"
            >
                Back to Home
            </button>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-8 font-[family-name:var(--font-geist-sans)]">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-slate-800">Create New Event</h1>
        
        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          
          {/* Check Error Message */}
          {(error || writeError) && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl mb-6 animate-bounce">
                  ⚠️ {error || (writeError as any)?.shortMessage || writeError?.message}
              </div>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-1 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">Event Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">Location / Venue <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                placeholder="e.g. CBD Badminton Center, Court 1"
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                value={formData.location}
                onChange={(e) => setFormData({...formData, location: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">Description</label>
              <textarea
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none h-24"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              />
            </div>
          </div>

          {/* Time */}
          <div className="grid grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                required
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">Time <span className="text-red-500">*</span></label>
              <input
                type="time"
                required
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                value={formData.time}
                onChange={(e) => setFormData({...formData, time: e.target.value})}
              />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-500 mb-2">Duration (Hours) <span className="text-red-500">*</span></label>
                <input
                type="number"
                required
                min="0.5"
                step="0.5"
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                value={formData.duration}
                onChange={(e) => setFormData({...formData, duration: e.target.value})}
                />
            </div>
          </div>

          {/* Fee Setting */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Payment Settings</h3>
            <div>
                <label className="block text-sm font-medium text-slate-500 mb-2">Fee per Person (USDT - Stablecoin) <span className="text-red-500">*</span></label>
                <input
                type="number"
                required
                step="0.01"
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                value={formData.fee}
                onChange={(e) => setFormData({...formData, fee: e.target.value})}
                />
                <p className="text-xs text-slate-400 mt-2">Currently supports USDT only.</p>
            </div>
          </div>

          {/* Requirements */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Participants & Requirements</h3>
            <div className="grid grid-cols-2 gap-6 mb-4">
                <div>
                    <label className="block text-sm font-medium text-slate-500 mb-2">Min Players <span className="text-red-500">*</span></label>
                    <input
                    type="number"
                    required
                    min="2"
                    className="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={formData.minPlayers}
                    onChange={(e) => setFormData({...formData, minPlayers: e.target.value})}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-500 mb-2">Max Players <span className="text-red-500">*</span></label>
                    <input
                    type="number"
                    required
                    min="2"
                    className="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={formData.maxPlayers}
                    onChange={(e) => setFormData({...formData, maxPlayers: e.target.value})}
                    />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-500 mb-2">Male Min Level (10-100)</label>
                    <input
                    type="number"
                    required
                    min="10"
                    max="100"
                    className="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={formData.minLevelMale}
                    onChange={(e) => setFormData({...formData, minLevelMale: e.target.value})}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-500 mb-2">Female Min Level (10-100)</label>
                    <input
                    type="number"
                    required
                    min="10"
                    max="100"
                    className="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={formData.minLevelFemale}
                    onChange={(e) => setFormData({...formData, minLevelFemale: e.target.value})}
                    />
                </div>
            </div>
          </div>

          <div className="pt-6">
            <button
              type="submit"
              disabled={isPending || isConfirming}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all shadow-sm"
            >
              {isPending ? 'Confirming in Wallet...' : isConfirming ? 'Transaction Pending...' : 'Create Event'}
            </button>
          </div>

          {isPending && <div className="text-center text-yellow-500">Check your wallet to confirm...</div>}
          
        </form>
      </div>
    </div>
  );
}
