import React from 'react';
import { DashboardSidebar } from '@/components/layout/DashboardSidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#09090b] text-zinc-100 selection:bg-purple-500 selection:text-white">
      {/* Fixed/Sticky Professional Studio Sidebar */}
      <DashboardSidebar />

      {/* Main Workspace Scrollable Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
