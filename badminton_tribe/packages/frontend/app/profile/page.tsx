'use client';

import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import CourtsideABI from '@/abi/Courtside.json';
import { COURTSIDE_ADDRESS, MOCK_USDT_ADDRESS } from '@/constants';
import { formatUnits, formatEther } from 'viem';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

export default function ProfilePage() {
    const { address } = useAccount();
    const { data: nextId } = useReadContract({
        address: COURTSIDE_ADDRESS as `0x${string}`,
        abi: CourtsideABI.abi as any,
        functionName: 'nextEventId',
    });

    const [allIds, setAllIds] = useState<bigint[]>([]);

    // 1. Generate all IDs
    useEffect(() => {
        if (nextId) {
            const max = Number(nextId);
            const arr = [];
            for (let i = 1; i < max; i++) {
                arr.push(BigInt(i));
            }
            setAllIds(arr);
        }
    }, [nextId]);

    // 2. Batch read withdrawableFunds for all events
    const { data: fundsData, refetch: refetchFunds } = useReadContracts({
        contracts: allIds.map(id => ({
            address: COURTSIDE_ADDRESS as `0x${string}`,
            abi: CourtsideABI.abi as any,
            functionName: 'withdrawableFunds',
            args: [id, address!],
        })),
        query: {
            enabled: !!address && allIds.length > 0
        }
    });

    // 3. Filter events with funds > 0
    const claimableEvents = useMemo(() => {
        if (!fundsData) return [];
        return fundsData.map((res, idx) => {
            if (res.status !== 'success') return null;
            const amount = res.result as bigint;
            if (amount > 0) {
                return { id: allIds[idx], amount };
            }
            return null;
        }).filter(Boolean) as { id: bigint, amount: bigint }[];
    }, [fundsData, allIds]);

    // 4. Batch read event details for claimable events (to get Name & Decimals)
    const { data: eventsDetails } = useReadContracts({
        contracts: claimableEvents.map(item => ({
            address: COURTSIDE_ADDRESS as `0x${string}`,
            abi: CourtsideABI.abi as any,
            functionName: 'events',
            args: [item.id],
        }))
    });

    // 5. Claim Logic
    const { writeContract, data: hash } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    useEffect(() => {
        if (isSuccess) {
            refetchFunds();
        }
    }, [isSuccess]);

    const handleClaim = (id: bigint) => {
        writeContract({
            address: COURTSIDE_ADDRESS as `0x${string}`,
            abi: CourtsideABI.abi as any,
            functionName: 'claimFunds',
            args: [id],
        });
    };

    // Calculate Total
    const totalFunds = useMemo(() => {
        // Assuming same decimals (18) for total display simply, 
        // but ideally should respect each token's decimal.
        // For MVP we assume MockUSDT (18).
        return claimableEvents.reduce((acc, curr) => acc + curr.amount, BigInt(0));
    }, [claimableEvents]);

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 p-8 font-[family-name:var(--font-geist-sans)]">
            <div className="max-w-3xl mx-auto">
                <header className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-800">My Profile</h1>
                    <Link href="/" className="text-emerald-500 font-bold hover:underline">&larr; Back to Events</Link>
                </header>

                {/* Dashboard Card */}
                <div className="bg-gradient-to-br from-emerald-500 to-teal-500 p-8 rounded-2xl shadow-lg mb-8 text-white">
                    <h2 className="text-emerald-100 text-lg mb-2">Total Withdrawable Balance</h2>
                    <div className="text-4xl font-bold">
                        {formatEther(totalFunds)} <span className="text-lg text-emerald-100">USDT (Approx)</span>
                    </div>
                    <p className="text-xs text-emerald-200 mt-2">* Funds from refunds, cancellations, or host payouts.</p>
                </div>

                {/* Claim List */}
                <h3 className="text-xl font-bold mb-4 text-slate-700">Pending Claims ({claimableEvents.length})</h3>
                
                <div className="space-y-4">
                    {isConfirming && <div className="p-4 bg-orange-100 text-orange-700 rounded-xl text-center animate-pulse border border-orange-200">Processing Claim...</div>}
                    
                    {claimableEvents.length === 0 ? (
                        <div className="text-slate-400 text-center py-12 bg-white rounded-xl border border-slate-200 border-dashed">
                            No funds to claim right now.
                        </div>
                    ) : (
                        claimableEvents.map((item, idx) => {
                            const evtData = eventsDetails?.[idx];
                            let name = "Loading...";
                            let decimals = 18;
                            
                            if (evtData && evtData.status === 'success') {
                                const evt: any = evtData.result;
                                name = evt[0];
                                decimals = evt[7] ? Number(evt[7]) : 18; 
                            }

                            return (
                                <div key={item.id} className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center">
                                    <div>
                                        <h4 className="font-bold text-lg text-slate-800">{name}</h4>
                                        <p className="text-slate-400 text-sm font-mono">Event ID: {item.id.toString()}</p>
                                    </div>
                                    <div className="text-right flex items-center gap-4">
                                        <div>
                                            <p className="text-2xl font-bold text-emerald-600">{formatUnits(item.amount, decimals)}</p>
                                            <p className="text-xs text-slate-400">USDT</p>
                                        </div>
                                        <button 
                                            onClick={() => handleClaim(item.id)}
                                            disabled={isConfirming}
                                            className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-300 text-white rounded-xl font-bold transition shadow-sm"
                                        >
                                            Claim
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
