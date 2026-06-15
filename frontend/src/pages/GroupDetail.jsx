import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { groupsApi, expensesApi, balancesApi } from '../api';
import { Trash2, ArrowLeft, ShieldAlert } from 'lucide-react';

export const GroupDetail = () => {
  const { groupId } = useParams();
  const gId = parseInt(groupId || '', 10);
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [balancesReport, setBalancesReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const groupRes = await groupsApi.getDetails(gId);
      setGroup(groupRes.data.group);
      
      const expRes = await expensesApi.list(gId);
      setExpenses(expRes.data.expenses);

      const balRes = await balancesApi.getReport(gId);
      setBalancesReport(balRes.data);
    } catch (err) {
      console.error('Failed to load group details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [gId]);

  const handleDeleteGroup = async () => {
    if (!confirm(`Are you sure you want to permanently delete the workspace "${group?.name}"? This cannot be undone.`)) return;
    try {
      await groupsApi.delete(gId);
      navigate('/');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete workspace.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="pb-12 text-slate-100">
      <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/')}
            className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            {group?.name}
          </h1>
        </div>
        <button
          onClick={handleDeleteGroup}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-semibold rounded-xl text-sm transition-colors"
          title="Delete Workspace"
        >
          <Trash2 className="w-4 h-4" />
          <span className="hidden sm:inline">Delete</span>
        </button>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        <div className="glassmorphism p-5 rounded-2xl border border-slate-800">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">Net Settlements</h3>
          {balancesReport?.recommendations?.length === 0 ? (
            <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 p-3 rounded-lg">
              All debts settled based on evaluated data!
            </p>
          ) : (
            <div className="space-y-2">
              {balancesReport?.recommendations?.map((rec, idx) => (
                <div key={idx} className="flex justify-between items-center p-2.5 bg-slate-900/60 border border-slate-800 rounded-lg">
                  <div className="text-xs">
                    <span className="font-bold text-red-400">{rec.from_user_name}</span>
                    <span className="text-slate-500 mx-1.5">pays</span>
                    <span className="font-bold text-green-400">{rec.to_user_name}</span>
                  </div>
                  <span className="font-mono font-bold text-slate-200 text-sm">
                    ₹{rec.amount_inr.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Spreadsheet Preview
            </h3>
          </div>
          
          <div className="border border-slate-900 rounded-2xl overflow-hidden glassmorphism">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-900/60 border-b border-slate-800/80 text-slate-400 font-semibold">
                    <th className="p-3 w-12 text-center">Row</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Paid By</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Currency</th>
                    <th className="p-3 max-w-xs">Split Info</th>
                    <th className="p-3">Actions / Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/50">
                  {expenses.map((expense, idx) => {
                    const isPending = expense.status === 'pending_review';
                    const bgClass = isPending ? 'bg-yellow-950/20 hover:bg-yellow-950/30' : 'hover:bg-slate-900/40';

                    let splitSummary = expense.split_type === 'equal' ? 'equal' : 'custom';
                    if (expense.splits && expense.splits.length > 0) {
                       const names = expense.splits.map(s => s.user.name).join(', ');
                       splitSummary = `${expense.split_type}: ${names}`;
                    }

                    return (
                      <tr key={expense.id} className={`transition-all duration-300 ${bgClass}`}>
                        <td className="p-3 font-mono text-center text-xs text-slate-500">{idx + 1}</td>
                        <td className="p-3">{new Date(expense.expense_date).toLocaleDateString()}</td>
                        <td className="p-3">{expense.description}</td>
                        <td className="p-3 font-bold">{expense.payer?.name}</td>
                        <td className="p-3 font-mono text-slate-200">
                          {expense.currency_original} {expense.amount_original.toFixed(2)}
                        </td>
                        <td className="p-3">{expense.currency_original}</td>
                        <td className="p-3 max-w-xs truncate text-slate-400 text-xs" title={splitSummary}>
                          {splitSummary}
                        </td>
                        <td className="p-3 text-xs">
                          {isPending ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-[10px] font-bold uppercase tracking-wider">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              PENDING
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-bold uppercase tracking-wider">
                              ACTIVE
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {expenses.length === 0 && (
                    <tr>
                      <td colSpan="8" className="p-8 text-center text-slate-500">
                        No expenses found for this group.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
