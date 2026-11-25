import React from 'react';
import { DashboardSidebar } from '@/components/layout/DashboardSidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)] selection:bg-blue-600 selection:text-white transition-colors duration-200">
      {/* Fixed/Sticky Professional Studio Sidebar with Mobile Drawer */}
      <DashboardSidebar />

      {/* Main Workspace Scrollable Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-[var(--background)] pt-14 md:pt-0">
        {children}
      </div>
    </div>
  );
}
