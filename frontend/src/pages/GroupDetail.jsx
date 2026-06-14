import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { groupsApi, expensesApi, balancesApi, settlementsApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { 
  ArrowLeft, Upload, FileText, ArrowRightLeft, CreditCard, Users, 
  Trash2, Plus, Calendar, Edit3, ShieldAlert, BadgeInfo, Info, X, Clock
} from 'lucide-react';

export const GroupDetail = () => {
  const { groupId } = useParams();
  const gId = parseInt(groupId || '', 10);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [balancesReport, setBalancesReport] = useState(null);
  const [loading, setLoading] = useState(true);

  // Forms
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [settlementFormOpen, setSettlementFormOpen] = useState(false);
  const [memberFormOpen, setMemberFormOpen] = useState(false);

  // Expense Form Fields
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [expenseDate, setExpenseDate] = useState('2026-02-01');
  const [paidByUserId, setPaidByUserId] = useState('');
  const [splitType, setSplitType] = useState('equal');
  const [splitDetails, setSplitDetails] = useState({});

  // Settlement Form Fields
  const [paidBy, setPaidBy] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleDate, setSettleDate] = useState('2026-02-01');

  // Member Timelines Form Fields
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [memberJoinedAt, setMemberJoinedAt] = useState('2026-02-01');
  const [memberLeftAt, setMemberLeftAt] = useState('');

  // Selected Member Audit Modal
  const [auditUserBreakdown, setAuditUserBreakdown] = useState(null);

  const loadData = async () => {
    try {
      const groupRes = await groupsApi.getDetails(gId);
      setGroup(groupRes.data.group);
      
      const expRes = await expensesApi.list(gId);
      setExpenses(expRes.data.expenses);

      const setRes = await settlementsApi.list(gId);
      setSettlements(setRes.data.settlements);

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

  const handleCreateExpense = async (e) => {
    e.preventDefault();
    if (!description || !amount || !paidByUserId) return;

    const splitsList = Object.entries(splitDetails).map(([uid, val]) => {
      const userId = parseInt(uid, 10);
      return {
        userId,
        percentage: splitType === 'percentage' ? parseFloat(val) : undefined,
        shares: splitType === 'share' ? parseFloat(val) : undefined,
        amount: splitType === 'unequal' ? parseFloat(val) : undefined,
      };
    });

    try {
      await expensesApi.create(gId, {
        description,
        amount: parseFloat(amount),
        currency,
        expenseDate,
        paidByUserId: parseInt(paidByUserId, 10),
        splitType,
        splits: splitsList
      });

      setDescription('');
      setAmount('');
      setSplitDetails({});
      setExpenseFormOpen(false);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create expense');
    }
  };

  const handleRecordSettlement = async (e) => {
    e.preventDefault();
    if (!paidBy || !paidTo || !settleAmount) return;

    try {
      await settlementsApi.create(gId, {
        paidByUserId: parseInt(paidBy, 10),
        paidToUserId: parseInt(paidTo, 10),
        amountInr: parseFloat(settleAmount),
        settledAt: settleDate
      });

      setPaidBy('');
      setPaidTo('');
      setSettleAmount('');
      setSettlementFormOpen(false);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to record settlement');
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMemberEmail) return;

    try {
      await groupsApi.addMember(gId, {
        email: newMemberEmail,
        joinedAt: memberJoinedAt,
        leftAt: memberLeftAt ? memberLeftAt : undefined
      });

      setNewMemberEmail('');
      setMemberFormOpen(false);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add member');
    }
  };

  const handleUpdateLeaveDate = async (userId, dateStr) => {
    try {
      await groupsApi.updateMembershipTimeline(gId, userId, {
        leftAt: dateStr ? new Date(dateStr).toISOString() : null
      });
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update leave date');
    }
  };

  const handleSoftDeleteExpense = async (expenseId) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      await expensesApi.delete(gId, expenseId);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

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

  const members = group?.memberships || [];

  return (
    <div className="pb-12 text-slate-100">
      <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          {group?.name}
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDeleteGroup}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-semibold rounded-xl text-sm transition-colors"
            title="Delete Workspace"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Delete</span>
          </button>
          <button
            onClick={() => setExpenseFormOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 gradient-brand text-white font-semibold rounded-xl text-sm shadow hover:opacity-95 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        <div className="lg:col-span-5 space-y-8">
          
          <div className="glassmorphism p-6 rounded-2xl border border-slate-800">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-brand-400" />
              <span>Net Settlement Summary</span>
            </h2>
            
            {balancesReport?.recommendations?.length === 0 ? (
              <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 p-3.5 rounded-xl">
                All debts have been fully settled. No transactions required!
              </p>
            ) : (
              <div className="space-y-3">
                {balancesReport?.recommendations?.map((rec, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-slate-900/60 border border-slate-900 rounded-xl">
                    <div className="text-xs">
                      <span className="font-bold text-red-400">{rec.from_user_name}</span>
                      <span className="text-slate-400 mx-1">pays</span>
                      <span className="font-bold text-green-400">{rec.to_user_name}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-slate-100 text-sm">
                        ₹{rec.amount_inr.toFixed(2)}
                      </span>
                      <button
                        onClick={() => {
                          setPaidBy(String(rec.from_user_id));
                          setPaidTo(String(rec.to_user_id));
                          setSettleAmount(String(rec.amount_inr));
                          setSettlementFormOpen(true);
                        }}
                        className="px-2.5 py-1 bg-brand-500/10 hover:bg-brand-500 hover:text-white border border-brand-500/20 text-brand-400 rounded-lg text-[10px] font-bold transition-all"
                      >
                        Settle
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glassmorphism p-6 rounded-2xl border border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-brand-400" />
                <span>Balances & Audit Trails</span>
              </h2>
              <span className="text-[10px] text-slate-500 italic">Click card for breakdown</span>
            </div>

            <div className="space-y-3">
              {balancesReport?.breakdowns?.map((b) => {
                const isOwed = b.net_balance_inr > 0;
                const isZero = Math.abs(b.net_balance_inr) < 0.1;
                return (
                  <div
                    key={b.user_id}
                    onClick={() => setAuditUserBreakdown(b)}
                    className="p-4 bg-slate-900/50 hover:bg-slate-900 border border-slate-900 hover:border-brand-500/30 rounded-xl cursor-pointer transition-all flex justify-between items-center"
                  >
                    <div>
                      <h4 className="font-bold text-white text-sm">{b.name}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-[10px] text-slate-400">
                          {new Date(b.joined_at).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}
                          {b.left_at ? ` to ${new Date(b.left_at).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}` : ' onwards'}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className={`font-mono text-sm font-bold ${isZero ? 'text-slate-400' : isOwed ? 'text-green-400' : 'text-red-400'}`}>
                        {isZero ? 'Settled' : isOwed ? `+₹${b.net_balance_inr.toFixed(2)}` : `-₹${Math.abs(b.net_balance_inr).toFixed(2)}`}
                      </p>
                      <span className="text-[10px] text-slate-500">
                        {isZero ? 'no dues' : isOwed ? 'is owed' : 'owes total'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glassmorphism p-6 rounded-2xl border border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-brand-400" />
                <span>Roommate Timelines</span>
              </h2>
              <button 
                onClick={() => setMemberFormOpen(true)}
                className="p-1 rounded bg-slate-900 border border-slate-800 text-brand-400 hover:bg-slate-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {members.map(m => (
                <div key={m.user_id} className="p-3 bg-slate-900/40 rounded-xl border border-slate-900 flex justify-between items-center text-xs">
                  <div>
                    <p className="font-bold text-slate-200">{m.user.name}</p>
                    <p className="text-slate-500 text-[10px]">{m.user.email}</p>
                  </div>

                  <div className="text-right flex flex-col items-end gap-1">
                    <span className="text-slate-400 font-medium">Joined: {new Date(m.joined_at).toLocaleDateString()}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">Left:</span>
                      <input
                        type="date"
                        value={m.left_at ? m.left_at.split('T')[0] : ''}
                        onChange={(e) => handleUpdateLeaveDate(m.user_id, e.target.value || null)}
                        className="bg-slate-950 border border-slate-800 rounded px-1 text-[10px] py-0.5 text-slate-300 focus:outline-none focus:border-brand-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-8">
          
          <div className="glassmorphism p-6 rounded-2xl border border-slate-800">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand-400" />
              <span>Expenses & Transactions</span>
            </h2>

            {expenses.length === 0 ? (
              <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-xl text-xs">
                No logged expenses found. Upload a CSV or add an expense manually.
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {expenses.map((e) => {
                  const isPending = e.status === 'pending_review';
                  return (
                    <div 
                      key={e.id} 
                      className={`p-4 bg-slate-900/60 border rounded-xl flex flex-col gap-3 transition-colors ${
                        isPending ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-slate-900 hover:border-slate-800'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-100 text-sm">{e.description}</h3>
                            {isPending && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-[10px] font-bold uppercase">
                                <ShieldAlert className="w-3 h-3" />
                                <span>Pending Approval</span>
                              </span>
                            )}
                            {e.is_settlement && (
                              <span className="inline-flex px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase">
                                Settlement Log
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1">
                            <span>Paid by: <strong className="text-slate-400">{e.payer?.name}</strong></span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(e.expense_date).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="font-mono text-sm font-bold text-slate-100">
                            {e.currency_original === 'USD' ? `$${e.amount_original}` : `₹${e.amount_original}`}
                          </p>
                          {e.currency_original !== 'INR' && (
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              ₹{e.amount_inr.toFixed(2)} (rate: {e.exchange_rate_used.toFixed(2)})
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="p-2.5 bg-slate-950/40 rounded-lg border border-slate-950 text-[10px] flex flex-wrap gap-x-4 gap-y-1 text-slate-400">
                        <span className="text-slate-500 font-semibold uppercase tracking-wide">Splits:</span>
                        {e.splits?.map((s, idx) => (
                          <span key={idx}>
                            {s.user?.name}: <strong className="text-slate-300">₹{s.amount_inr.toFixed(1)}</strong>
                          </span>
                        ))}
                      </div>

                      <div className="flex justify-between items-center pt-2.5 border-t border-slate-950/50">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 capitalize">
                          Split: {e.split_type}
                        </span>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSoftDeleteExpense(e.id)}
                            className="p-1.5 text-slate-500 hover:text-red-400 rounded hover:bg-slate-950 transition-colors"
                            title="Delete Expense"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {expenseFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg glassmorphism rounded-2xl shadow-2xl p-6 relative border border-slate-800 max-h-[90vh] overflow-y-auto">
            <button onClick={() => setExpenseFormOpen(false)} className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-bold text-white mb-6">Log Shared Expense</h2>

            <form onSubmit={handleCreateExpense} className="space-y-4 text-sm">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Dinner, Rent, Taxi"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-brand-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Expense Date</label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Paid By</label>
                  <select
                    value={paidByUserId}
                    onChange={(e) => setPaidByUserId(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none"
                    required
                  >
                    <option value="">Select Payer</option>
                    {members.map(m => (
                      <option key={m.user_id} value={m.user_id}>{m.user.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Split Type</label>
                <select
                  value={splitType}
                  onChange={(e) => setSplitType(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none"
                >
                  <option value="equal">Equal Splitting</option>
                  <option value="percentage">Percentage Splitting</option>
                  <option value="share">Shares Proportion</option>
                  <option value="unequal">Unequal (Fixed original amount)</option>
                </select>
              </div>

              {splitType !== 'equal' && (
                <div className="p-4 bg-slate-950/60 border border-slate-900 rounded-xl space-y-3">
                  <p className="text-xs font-semibold text-slate-400 mb-1">Enter values for members:</p>
                  {members.map(m => (
                    <div key={m.user_id} className="flex justify-between items-center gap-3">
                      <span>{m.user.name}</span>
                      <input
                        type="number"
                        placeholder={splitType === 'percentage' ? '%' : splitType === 'share' ? 'shares' : 'amount'}
                        value={splitDetails[m.user_id] || ''}
                        onChange={(e) => setSplitDetails({ ...splitDetails, [m.user_id]: e.target.value })}
                        className="w-24 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded text-right text-slate-100"
                      />
                    </div>
                  ))}
                </div>
              )}

              <button type="submit" className="w-full py-3 rounded-xl gradient-brand text-white font-semibold shadow hover:opacity-95 transition-opacity">
                Save Expense
              </button>
            </form>
          </div>
        </div>
      )}

      {settlementFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md glassmorphism rounded-2xl shadow-2xl p-6 relative border border-slate-800">
            <button onClick={() => setSettlementFormOpen(false)} className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-white mb-6">Record Settlement Payment</h2>

            <form onSubmit={handleRecordSettlement} className="space-y-4 text-sm">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Paid By (Sender)</label>
                <select
                  value={paidBy}
                  onChange={(e) => setPaidBy(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100"
                  required
                >
                  <option value="">Select Payer</option>
                  {members.map(m => (
                    <option key={m.user_id} value={m.user_id}>{m.user.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Paid To (Receiver)</label>
                <select
                  value={paidTo}
                  onChange={(e) => setPaidTo(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100"
                  required
                >
                  <option value="">Select Receiver</option>
                  {members.map(m => (
                    <option key={m.user_id} value={m.user_id}>{m.user.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Amount (INR)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Date</label>
                <input
                  type="date"
                  value={settleDate}
                  onChange={(e) => setSettleDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100"
                  required
                />
              </div>

              <button type="submit" className="w-full py-3 rounded-xl gradient-brand text-white font-semibold transition-opacity hover:opacity-95">
                Save Settlement
              </button>
            </form>
          </div>
        </div>
      )}

      {memberFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md glassmorphism rounded-2xl shadow-2xl p-6 relative border border-slate-800">
            <button onClick={() => setMemberFormOpen(false)} className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-white mb-6">Add Roommate Timeline</h2>

            <form onSubmit={handleAddMember} className="space-y-4 text-sm">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Member Email</label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Join Date</label>
                <input
                  type="date"
                  value={memberJoinedAt}
                  onChange={(e) => setMemberJoinedAt(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Leave Date (Optional)</label>
                <input
                  type="date"
                  value={memberLeftAt}
                  onChange={(e) => setMemberLeftAt(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>

              <button type="submit" className="w-full py-3 rounded-xl gradient-brand text-white font-semibold transition-opacity hover:opacity-95">
                Save Member Timeline
              </button>
            </form>
          </div>
        </div>
      )}

      {auditUserBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-3xl glassmorphism rounded-2xl shadow-2xl p-6 relative border border-slate-800 max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setAuditUserBreakdown(null)} 
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <header className="mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <span>Audit Trail: {auditUserBreakdown.name}</span>
              </h2>
              <div className="flex gap-2.5 items-center text-xs text-slate-400 mt-1">
                <span>Joined {new Date(auditUserBreakdown.joined_at).toLocaleDateString()}</span>
                {auditUserBreakdown.left_at && (
                  <span className="text-red-400">Left {new Date(auditUserBreakdown.left_at).toLocaleDateString()}</span>
                )}
              </div>
            </header>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-900 mb-6 text-center">
              <div>
                <p className="text-[10px] text-slate-500 font-semibold uppercase">Paid (Expenses)</p>
                <p className="font-mono text-sm font-bold text-green-400 mt-1">
                  ₹{auditUserBreakdown.total_paid_expenses_inr.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-semibold uppercase">Owed (Splits)</p>
                <p className="font-mono text-sm font-bold text-red-400 mt-1">
                  -₹{auditUserBreakdown.total_owed_splits_inr.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-semibold uppercase">Paid (Settle)</p>
                <p className="font-mono text-sm font-bold text-slate-300 mt-1">
                  +₹{auditUserBreakdown.total_paid_settlements_inr.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-semibold uppercase">Received (Settle)</p>
                <p className="font-mono text-sm font-bold text-slate-300 mt-1">
                  -₹{auditUserBreakdown.total_received_settlements_inr.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center px-4 py-3 bg-brand-500/10 border border-brand-500/20 rounded-xl mb-6">
              <span className="text-xs text-slate-300 font-semibold">Net Balance Formula Result:</span>
              <span className="font-mono font-bold text-slate-100">
                ₹{auditUserBreakdown.total_paid_expenses_inr.toFixed(1)} - ₹{auditUserBreakdown.total_owed_splits_inr.toFixed(1)} + ₹{auditUserBreakdown.total_paid_settlements_inr.toFixed(1)} - ₹{auditUserBreakdown.total_received_settlements_inr.toFixed(1)} = <strong className={auditUserBreakdown.net_balance_inr >= 0 ? 'text-green-400' : 'text-red-400'}>₹{auditUserBreakdown.net_balance_inr.toFixed(2)}</strong>
              </span>
            </div>

            <div className="space-y-6 text-xs">
              <div>
                <h4 className="font-bold text-white mb-2 text-xs flex justify-between items-center">
                  <span>Paid Expenses (Credited)</span>
                  <span className="font-normal text-slate-500">Total: {auditUserBreakdown.contributing_paid_expenses?.length || 0} items</span>
                </h4>
                <div className="max-h-36 overflow-y-auto space-y-1.5">
                  {auditUserBreakdown.contributing_paid_expenses?.map((e, idx) => (
                    <div key={idx} className="flex justify-between p-2.5 bg-slate-900/30 rounded border border-slate-900/60">
                      <span>{e.description} ({new Date(e.expense_date).toLocaleDateString()})</span>
                      <span className="font-mono text-slate-200">₹{e.total_amount_inr.toFixed(2)}</span>
                    </div>
                  ))}
                  {(!auditUserBreakdown.contributing_paid_expenses || auditUserBreakdown.contributing_paid_expenses.length === 0) && (
                    <p className="text-slate-500 italic">No expenses paid.</p>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-white mb-2 text-xs flex justify-between items-center">
                  <span>Owed Splits (Debited)</span>
                  <span className="font-normal text-slate-500">Total: {auditUserBreakdown.contributing_owed_splits?.length || 0} items</span>
                </h4>
                <div className="max-h-36 overflow-y-auto space-y-1.5">
                  {auditUserBreakdown.contributing_owed_splits?.map((e, idx) => (
                    <div key={idx} className="flex justify-between p-2.5 bg-slate-900/30 rounded border border-slate-900/60">
                      <span>{e.description} ({new Date(e.expense_date).toLocaleDateString()})</span>
                      <span className="font-mono text-red-400">-₹{e.user_share_inr.toFixed(2)}</span>
                    </div>
                  ))}
                  {(!auditUserBreakdown.contributing_owed_splits || auditUserBreakdown.contributing_owed_splits.length === 0) && (
                    <p className="text-slate-500 italic">No split contributions.</p>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-white mb-2 text-xs flex justify-between items-center">
                  <span>Settlements Audit</span>
                  <span className="font-normal text-slate-500">Total: {auditUserBreakdown.contributing_settlements?.length || 0} items</span>
                </h4>
                <div className="max-h-36 overflow-y-auto space-y-1.5">
                  {auditUserBreakdown.contributing_settlements?.map((s, idx) => (
                    <div key={idx} className="flex justify-between p-2.5 bg-slate-900/30 rounded border border-slate-900/60">
                      <span>
                        {s.type === 'paid' ? `Settlement paid to ${s.other_user_name}` : `Settlement received from ${s.other_user_name}`} 
                        ({new Date(s.settled_at).toLocaleDateString()})
                      </span>
                      <span className={`font-mono ${s.type === 'paid' ? 'text-green-400' : 'text-red-400'}`}>
                        {s.type === 'paid' ? `+₹${s.amount_inr.toFixed(2)}` : `-₹${s.amount_inr.toFixed(2)}`}
                      </span>
                    </div>
                  ))}
                  {(!auditUserBreakdown.contributing_settlements || auditUserBreakdown.contributing_settlements.length === 0) && (
                    <p className="text-slate-500 italic">No settlements recorded.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
