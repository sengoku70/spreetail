import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { groupsApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { Users, Upload, LogOut, Wallet, User as UserIcon, ArrowRight, Trash2 } from 'lucide-react';

export const Dashboard = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const loadGroups = async () => {
    try {
      const response = await groupsApi.list();
      setGroups(response.data.groups);
    } catch (err) {
      console.error('Failed to load groups:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  return (
    <div className="pb-12">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
        <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
              Dashboard
            </h1>
            <p className="text-slate-400">
              Welcome back, {user?.name}. Here are your active roommate balance groups.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-4 md:mt-0 self-start md:self-auto">
            {groups.length > 0 && (
              <button
                onClick={async () => {
                  if (window.confirm('Are you sure you want to delete all workspaces? This action cannot be undone.')) {
                    await groupsApi.deleteAll();
                    loadGroups();
                  }
                }}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-red-950/40 border border-red-500/20 text-red-400 font-semibold shadow-lg hover:bg-red-950/60 transition-all"
              >
                <Trash2 className="w-5 h-5" />
                <span>Clear All History</span>
              </button>
            )}
            <button
              onClick={() => navigate('/import')}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl gradient-brand text-white font-semibold shadow-lg shadow-brand-500/15 hover:opacity-95 active:scale-[0.99] transition-all"
            >
              <Upload className="w-5 h-5" />
              <span>Import CSV</span>
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-20 glassmorphism rounded-2xl border border-slate-900">
            <Users className="w-16 h-16 text-slate-600 mx-auto mb-4 animate-bounce" />
            <h2 className="text-xl font-bold text-white mb-2">No Groups Found</h2>
            <p className="text-slate-400 max-w-sm mx-auto mb-6">
              To get started splitting shared expenses, upload your first messy spreadsheet.
            </p>
            <button
              onClick={() => navigate('/import')}
              className="px-5 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-brand-400 font-semibold hover:bg-slate-800 transition-colors inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Import Spreadsheet
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups.map(group => (
              <div
                key={group.id}
                onClick={() => navigate(`/groups/${group.id}`)}
                className="glassmorphism p-6 rounded-2xl cursor-pointer hover:border-brand-500/30 glow-hover flex flex-col justify-between group"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-bold text-white group-hover:text-brand-400 transition-colors">
                      {group.name}
                    </h3>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (window.confirm('Delete this workspace?')) {
                          await groupsApi.delete(group.id);
                          loadGroups();
                        }
                      }}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-slate-400 text-xs mb-4">
                    Created on {new Date(group.created_at).toLocaleDateString()}
                  </p>
                  
                  <div className="space-y-1.5 mb-6">
                    <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Members ({group.memberships.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.memberships.map((m, idx) => (
                        <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-900 text-slate-300 border border-slate-800">
                          {m.user.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-slate-900">
                  <span className="text-brand-400 text-sm font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    View Balances & Expenses <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
