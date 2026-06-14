import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { groupsApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { Wallet, LogOut, Upload, FileText, Menu, X } from 'lucide-react';

export const AppLayout = () => {
  const [groups, setGroups] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (user) {
      groupsApi.list().then(res => setGroups(res.data.groups)).catch(console.error);
    }
  }, [user, location.pathname]);

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-100">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 glassmorphism border-r border-slate-900 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0 flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex items-center justify-between border-b border-slate-900">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <div className="p-1.5 rounded-lg gradient-brand">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <span className="font-extrabold text-xl bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              SplitSmart
            </span>
          </div>
          <button className="lg:hidden text-slate-400" onClick={() => setIsSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 px-2 mt-2">Imported Spreadsheets</div>
          
          <button 
            onClick={() => { navigate('/import'); setIsSidebarOpen(false); }}
            className="w-full mb-6 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 font-semibold transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>

          {groups.map(group => (
            <div 
              key={group.id}
              onClick={() => { navigate(`/groups/${group.id}`); setIsSidebarOpen(false); }}
              className={`p-3 rounded-xl cursor-pointer transition-colors flex items-start gap-3 ${location.pathname === `/groups/${group.id}` ? 'bg-slate-900 border border-slate-800 shadow-sm' : 'hover:bg-slate-900/50 border border-transparent'}`}
            >
              <FileText className={`w-5 h-5 shrink-0 mt-0.5 ${location.pathname === `/groups/${group.id}` ? 'text-brand-400' : 'text-slate-600'}`} />
              <div className="overflow-hidden">
                <div className="font-semibold text-sm text-slate-200 truncate">{group.name}</div>
                <div className="text-xs text-slate-500 mt-1">{new Date(group.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <div className="text-center px-4 py-8 text-slate-500 text-sm">
              No spreadsheets imported yet.
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-900 bg-slate-950/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-brand-500/10 flex items-center justify-center text-brand-400 font-bold border border-brand-500/20">
                {user?.name.charAt(0)}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-200 truncate max-w-[120px]">{user?.name}</span>
                <span className="text-[10px] text-slate-500">Account Active</span>
              </div>
            </div>
            <button onClick={() => logout().then(() => navigate('/login'))} className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative bg-slate-950">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between p-4 border-b border-slate-900 glassmorphism sticky top-0 z-40">
          <button onClick={() => setIsSidebarOpen(true)} className="text-slate-400 hover:text-white">
            <Menu className="w-6 h-6" />
          </button>
          <div className="font-extrabold text-lg text-white">SplitSmart</div>
          <div className="w-6" />
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
      )}
    </div>
  );
};
