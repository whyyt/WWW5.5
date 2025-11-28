'use client';

import { useReadContract, useReadContracts, useAccount } from 'wagmi';
import CourtsideABI from '@/abi/Courtside.json';
import { COURTSIDE_ADDRESS } from '@/constants';
import Link from 'next/link';
import { formatEther } from 'viem';
import { useEffect, useState, useMemo } from 'react';

// Helper to format date range
const formatDateRange = (startTs: number, duration: number) => {
    const start = new Date(startTs * 1000);
    const end = new Date((startTs + duration) * 1000);

    const dateOptions: Intl.DateTimeFormatOptions = { month: 'numeric', day: 'numeric' };
    const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };

    const dateStr = start.toLocaleDateString(undefined, dateOptions);
    const startTimeStr = start.toLocaleTimeString(undefined, timeOptions);
    const endTimeStr = end.toLocaleTimeString(undefined, timeOptions);

    if (start.getDate() !== end.getDate()) {
        const endDateStr = end.toLocaleDateString(undefined, dateOptions);
        return `${dateStr} ${startTimeStr} - ${endDateStr} ${endTimeStr}`;
    }

    return `${dateStr} ${startTimeStr} - ${endTimeStr}`;
};

function EventCard({ id, status }: { id: number, status: string }) {
    const { data: eventData } = useReadContract({
        address: COURTSIDE_ADDRESS as `0x${string}`,
        abi: CourtsideABI.abi as any,
        functionName: 'events',
        args: [BigInt(id)],
    });

    if (!eventData) return <div className="animate-pulse h-32 bg-gray-800 rounded-xl"></div>;

    const evt: any = eventData; 
    
    // Index mapping: 0:name, 1:desc, 2:location, 3:startTime, 4:duration, 5:host, 6:token, 7:decimals, 8:fee
    const decimals = evt[7] ? Number(evt[7]) : 18;
    const fee = evt[8] ? (Number(evt[8]) / (10 ** decimals)).toString() : '0'; 
    const eventName = evt[0]; 
    const location = evt[2];
    const startTime = Number(evt[3]);
    const duration = Number(evt[4]);

    const timeDisplay = formatDateRange(startTime, duration);

    return (
        <Link href={`/events/${id}`} className="block p-6 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all group">
            <div className="flex justify-between items-start">
                <h3 className="text-xl font-bold text-slate-800 group-hover:text-emerald-600">{eventName}</h3>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    status === 'Open' ? 'bg-emerald-100 text-emerald-700' : 
                    status === 'Full' ? 'bg-orange-100 text-orange-700' :
                    status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                    'bg-slate-100 text-slate-500'
                }`}>
                    {status}
                </span>
            </div>
            <div className="mt-4 flex flex-col sm:flex-row gap-4 text-slate-500 text-sm">
                <div className="flex items-center gap-1">
                    <span className="text-lg">💰</span> <span className="font-semibold text-slate-700">{fee} USDT</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-lg">📍</span> {location}
                </div>
                <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                    <span className="text-lg">⏰</span> {timeDisplay}
                </div>
            </div>
        </Link>
    );
}

export default function EventList() {
    const { address } = useAccount();
    const { data: nextId } = useReadContract({
        address: COURTSIDE_ADDRESS as `0x${string}`,
        abi: CourtsideABI.abi as any,
        functionName: 'nextEventId',
    });

    const [ids, setIds] = useState<number[]>([]);
    const [filter, setFilter] = useState<string>('All');

    useEffect(() => {
        if (nextId) {
            const max = Number(nextId);
            const arr = [];
            for (let i = max - 1; i >= 1; i--) {
                arr.push(i);
            }
            setIds(arr);
        }
    }, [nextId]);

    // 1. Batch fetch Statuses
    const { data: statuses } = useReadContracts({
        contracts: ids.map(id => ({
            address: COURTSIDE_ADDRESS as `0x${string}`,
            abi: CourtsideABI.abi as any,
            functionName: 'eventStatus',
            args: [BigInt(id)],
        }))
    });

    // 2. Batch fetch Event Details (for Host filter)
    const { data: eventsDetails } = useReadContracts({
        contracts: ids.map(id => ({
            address: COURTSIDE_ADDRESS as `0x${string}`,
            abi: CourtsideABI.abi as any,
            functionName: 'events',
            args: [BigInt(id)],
        }))
    });

    // 3. Batch fetch My Player Info (for Joined filter)
    const { data: myPlayerInfo } = useReadContracts({
        contracts: ids.map(id => ({
            address: COURTSIDE_ADDRESS as `0x${string}`,
            abi: CourtsideABI.abi as any,
            functionName: 'players',
            args: [BigInt(id), address!],
        })),
        query: {
            enabled: !!address && ids.length > 0,
        }
    });

    const statusTextMap = ['Draft', 'Open', 'Full', 'Active', 'Settling', 'Completed', 'Cancelled'];

    const filteredEvents = useMemo(() => {
        if (!statuses) return [];
        
        return ids.map((id, index) => {
            // Status
            const statusResult = statuses[index];
            const statusIdx = statusResult.status === 'success' ? Number(statusResult.result) : 0;
            const statusText = statusTextMap[statusIdx] || 'Unknown';

            // Host Check
            let isMyHosted = false;
            if (eventsDetails && eventsDetails[index].status === 'success') {
                const evt = eventsDetails[index].result as any;
                // evt[5] is host address
                if (evt && address && evt[5] === address) {
                    isMyHosted = true;
                }
            }

            // Joined Check
            let isMyJoined = false;
            if (myPlayerInfo && myPlayerInfo[index].status === 'success') {
                const info = myPlayerInfo[index].result as any;
                // info[1] is hasPaid
                if (info && info[1] === true) {
                    isMyJoined = true;
                }
            }

            return { id, status: statusText, isMyHosted, isMyJoined };
        }).filter(item => {
            if (filter === 'All') return true;
            if (filter === 'MyHosted') return item.isMyHosted;
            if (filter === 'MyJoined') return item.isMyJoined;
            return item.status === filter;
        });
    }, [ids, statuses, eventsDetails, myPlayerInfo, filter, address]);

    if (!nextId || Number(nextId) <= 1) {
        return (
            <div className="mt-8 p-12 bg-slate-50 rounded-xl text-center border border-slate-200 border-dashed">
                <p className="text-slate-400 text-lg">No events found.</p>
                <Link href="/create" className="text-emerald-500 hover:underline mt-2 inline-block font-semibold">Create the first one!</Link>
            </div>
        );
    }

    return (
        <div>
            {/* Filter Bar */}
            <div className="flex justify-end mb-6">
                <div className="relative">
                    <select 
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="appearance-none border border-emerald-500 bg-white text-emerald-600 py-2 px-4 pr-8 rounded-xl leading-tight focus:outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer shadow-sm text-sm font-semibold hover:bg-emerald-50 transition-all duration-200"
                    >
                        <option value="All">All Events</option>
                        <optgroup label="Personal">
                            <option value="MyHosted">My Hosted</option>
                            <option value="MyJoined">My Joined</option>
                        </optgroup>
                        <optgroup label="By Status">
                            <option value="Open">Open (Registering)</option>
                            <option value="Full">Full</option>
                            <option value="Active">Active (Ongoing)</option>
                            <option value="Settling">Settling</option>
                            <option value="Completed">Completed</option>
                            <option value="Cancelled">Cancelled</option>
                        </optgroup>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                        </svg>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="grid gap-4">
                {filteredEvents.length > 0 ? (
                    filteredEvents.map(item => (
                        <EventCard key={item.id} id={item.id} status={item.status} />
                    ))
                ) : (
                    <div className="text-center py-8 text-slate-400">
                        No events found matching filter.
                    </div>
                )}
            </div>
        </div>
    );
}
