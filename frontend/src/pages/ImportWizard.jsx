import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { importApi, balancesApi, expensesApi } from '../api';
import { Upload, ArrowLeft, ShieldAlert, CheckCircle, FileJson, XCircle, Trash2, ArrowRight, Expand, Shrink } from 'lucide-react';

export const ImportWizard = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [gId, setGId] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [anomalies, setAnomalies] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [batchId, setBatchId] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [isHistoryMode, setIsHistoryMode] = useState(false);
  const [originalFilename, setOriginalFilename] = useState('Imported Spreadsheet.csv');

  useEffect(() => {
    if (groupId) {
      const id = parseInt(groupId, 10);
      setGId(id);
      setIsHistoryMode(true);
      setBatchId(id); // Fake batchId to show UI

      const loadHistory = async () => {
        setUploading(true);
        try {
          const expRes = await import('../api').then(m => m.expensesApi.list(id));
          
          const mappedRows = expRes.data.expenses.map((e, idx) => {
            let splitSummary = e.split_type === 'equal' ? 'equal' : 'custom';
            if (e.splits && e.splits.length > 0) {
              const names = e.splits.map(s => s.user.name).join(';');
              splitSummary = names;
            }
            return {
              expenseId: e.id,
              rowNumber: idx + 1,
              date: new Date(e.expense_date).toLocaleDateString(),
              description: e.description,
              paid_by: e.payer?.name,
              amount: e.amount_original.toString(),
              currency: e.currency_original,
              split_details: splitSummary,
              split_with: '',
              split_type: e.split_type,
              status: e.status
            };
          });
          
          setCsvRows(mappedRows);
          
          // Map pending expenses to fake anomalies so badges show up
          const fakeAnomalies = [];
          mappedRows.forEach(row => {
            if (row.status === 'pending_review') {
              fakeAnomalies.push({
                id: `pending-${row.expenseId}`,
                anomaly_type: 'PENDING_APPROVAL',
                row_number: row.rowNumber,
                requires_approval: true
              });
            }
          });
          setAnomalies(fakeAnomalies);
          
        } catch (err) {
          setError('Failed to load history');
        } finally {
          setUploading(false);
          setSuccess(true);
        }
      };
      
      loadHistory();
    }
  }, [groupId]);

  const csvBalances = React.useMemo(() => {
    if (!csvRows || csvRows.length === 0) return null;

    const balances = {};
    const getB = (name) => {
      const n = (name || 'Unknown').trim();
      const lowerN = n.toLowerCase();
      const existing = Object.keys(balances).find(k => k.toLowerCase() === lowerN);
      const realName = existing || n;
      if (!balances[realName]) {
        balances[realName] = { name: realName, paid: 0, owed: 0, net: 0 };
      }
      return balances[realName];
    };

    csvRows.forEach(row => {
      const amount = parseFloat((row.amount || '').replace(/,/g, '')) || 0;
      if (amount <= 0) return;

      const payer = (row.paid_by || '').trim();
      if (payer) {
        getB(payer).paid += amount;
      }

      const splitType = (row.split_type || 'equal').toLowerCase();
      
      if (splitType === 'equal') {
        const splitters = (row.split_with || row.split_details || '').split(';').map(s => s.trim()).filter(Boolean);
        if (splitters.length > 0) {
          const splitAmount = amount / splitters.length;
          splitters.forEach(s => getB(s).owed += splitAmount);
        }
      } else {
        const details = (row.split_details || '').split(';').map(s => s.trim()).filter(Boolean);
        if (splitType === 'percentage') {
          details.forEach(d => {
            const match = d.match(/(.+)\(([\d.]+)/);
            if (match) getB(match[1].trim()).owed += (parseFloat(match[2]) / 100) * amount;
          });
        } else if (splitType === 'share') {
           let totalShares = 0;
           details.forEach(d => {
             const match = d.match(/(.+)\(([\d.]+)/);
             if (match) totalShares += parseFloat(match[2]) || 0;
           });
           details.forEach(d => {
             const match = d.match(/(.+)\(([\d.]+)/);
             if (match && totalShares > 0) {
               getB(match[1].trim()).owed += (parseFloat(match[2]) / totalShares) * amount;
             }
           });
        } else if (splitType === 'unequal') {
           details.forEach(d => {
             const match = d.match(/(.+)\(([\d.]+)/);
             if (match) getB(match[1].trim()).owed += parseFloat(match[2]) || 0;
           });
        }
      }
    });

    const breakdowns = Object.values(balances).map(b => {
      b.net = b.paid - b.owed;
      return b;
    });

    const recommendations = [];
    const debts = breakdowns.map(b => ({ name: b.name, balance: b.net })).sort((a, b) => a.balance - b.balance);
    
    let iterations = 0;
    while (iterations < debts.length * 2) {
      debts.sort((a, b) => a.balance - b.balance);
      const debtor = debts[0];
      const creditor = debts[debts.length - 1];
      if (!debtor || !creditor) break;
      if (Math.abs(debtor.balance) < 0.1 && Math.abs(creditor.balance) < 0.1) break;
      
      const amount = Math.min(Math.abs(debtor.balance), creditor.balance);
      if (amount < 0.1) break;

      recommendations.push({
        from_user_name: debtor.name,
        to_user_name: creditor.name,
        amount_inr: amount
      });

      debtor.balance += amount;
      creditor.balance -= amount;
      iterations++;
    }

    return { breakdowns, recommendations };
  }, [csvRows]);
  const fileInputRef = useRef(null);

  const handleEditRowSave = async (rowNum, newRowData) => {
    const updatedRows = csvRows.map(r => r.rowNumber === rowNum ? { ...r, ...newRowData } : r);
    setCsvRows(updatedRows);
    setEditingRow(null);

    const headers = ['date', 'description', 'paid_by', 'amount', 'currency', 'split_type', 'split_with', 'split_details', 'notes'];
    const headerRow = headers.join(',');
    const bodyRows = updatedRows.map(r => {
      return headers.map(h => {
        let val = r[h] || '';
        val = String(val).replace(/"/g, '""');
        if (val.includes(',') || val.includes('\n') || val.includes('"')) {
          return `"${val}"`;
        }
        return val;
      }).join(',');
    }).join('\n');
    
    const newCsvContent = `${headerRow}\n${bodyRows}`;
    const file = new File([newCsvContent], originalFilename, { type: 'text/csv' });
    await processFile(file, true);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOriginalFilename(file.name);
    await processFile(file);
  };

  const processFile = async (file, forceImport = false) => {
    setUploading(true);
    setError('');
    
    if (!forceImport) {
      setSuccess(false);
      setAnomalies([]);
      setCsvRows([]);
      setBatchId(null);
    }

    try {
      const text = await file.text();
      const response = await importApi.uploadCSV({
        filename: file.name,
        csvContent: text,
        forceImport,
      });

      const data = response.data;
      setBatchId(data.batchId);
      setGId(data.groupId);
      setCsvRows(data.csvRows || []);

      const anomaliesRes = await importApi.getAnomalies(data.batchId);
      setAnomalies(anomaliesRes.data.anomalies);
      
      if (anomaliesRes.data.anomalies.length === 0) {
        setSuccess(true);
      }
    } catch (err) {
      if (err.response?.data?.code === 'DUPLICATE_FILE') {
        const proceed = window.confirm(`File '${file.name}' has already been imported.\nDo you want to import it anyway and create a new workspace?`);
        if (proceed) {
          await processFile(file, true);
          return;
        }
      } else {
        setError(err.response?.data?.message || 'Failed to process CSV file.');
      }
    } finally {
      setUploading(false);
    }
  };

  const handleApprove = async (anomalyId) => {
    try {
      if (typeof anomalyId === 'string' && anomalyId.startsWith('pending-')) {
        const expId = parseInt(anomalyId.split('-')[1], 10);
        await expensesApi.update(gId, expId, {});
      } else {
        await importApi.approveAnomaly(anomalyId);
      }
      setAnomalies(prev =>
        prev.map(a =>
          a.id === anomalyId
            ? { ...a, approved_by: 999, approved_at: new Date().toISOString() }
            : a
        )
      );
    } catch (err) {
      alert(err.response?.data?.message || 'Approval failed.');
    }
  };

  const handleDiscard = async (anomalyId) => {
    try {
      if (typeof anomalyId === 'string' && anomalyId.startsWith('pending-')) {
        const expId = parseInt(anomalyId.split('-')[1], 10);
        await expensesApi.delete(gId, expId);
      } else {
        await importApi.discardAnomaly(anomalyId);
      }
      setAnomalies(prev => prev.filter(a => a.id !== anomalyId));
    } catch (err) {
      alert(err.response?.data?.message || 'Discard failed.');
    }
  };

  const handleTakeAsNewUser = async (anomaly) => {
    try {
      await importApi.createNewUser(anomaly.id);
      
      const headers = ['date', 'description', 'paid_by', 'amount', 'currency', 'split_type', 'split_with', 'split_details', 'notes'];
      const headerRow = headers.join(',');
      const bodyRows = csvRows.map(r => {
        return headers.map(h => {
          let val = r[h] || '';
          val = String(val).replace(/"/g, '""');
          if (val.includes(',') || val.includes('\n') || val.includes('"')) {
            return `"${val}"`;
          }
          return val;
        }).join(',');
      }).join('\n');
      
      const newCsvContent = `${headerRow}\n${bodyRows}`;
      const file = new File([newCsvContent], originalFilename, { type: 'text/csv' });
      await processFile(file, true);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create user.');
    }
  };


  const pendingApprovals = anomalies.filter(a => a.requires_approval && !a.approved_at);
  const hasUnresolvedCriticalAnomalies = anomalies.some(a => a.requires_approval && !a.approved_at && a.anomaly_type !== 'DUPLICATE_EXPENSE_ORIGINAL');

  const renderAmount = (rawAmt) => {
    if (!rawAmt) return <span></span>;
    if (typeof rawAmt !== 'string') rawAmt = String(rawAmt);
    if (rawAmt.includes(',')) {
      const cleaned = rawAmt.replace(/,/g, '');
      const hasOthers = !/^\-?\d+(\.\d+)?$/.test(cleaned.replace(/\"/g, '').trim());
      if (hasOthers) {
        return (
          <div className="text-red-400 font-bold">
            {rawAmt} <span className="text-[10px] font-normal block text-red-500/80">(Problem: invalid format)</span>
          </div>
        );
      } else {
        return (
          <div className="text-green-400">
            {cleaned} <span className="text-[10px] text-slate-400 block font-mono">(Comma removed)</span>
          </div>
        );
      }
    }
    
    const hasOthers = !/^\-?\d+(\.\d+)?$/.test(rawAmt.replace(/\"/g, '').trim());
    if (hasOthers) {
      return (
        <div className="text-red-400 font-bold">
          {rawAmt} <span className="text-[10px] font-normal block text-red-500/80">(Problem: invalid format)</span>
        </div>
      );
    }
    return <span>{rawAmt}</span>;
  };

  return (
    <div className="min-h-screen bg-slate-950 font-sans selection:bg-brand-500/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        <header className="mb-12 text-center max-w-2xl mx-auto relative z-10">
          <button 
            onClick={() => navigate('/dashboard')}
            className="absolute left-0 top-2 flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
          <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
            CSV Import Pipeline
          </h1>
          <p className="mt-4 text-slate-400 text-sm">
            Upload messy spreadsheets. Our importer automatically checks and flags 18 types of data anomalies.
          </p>
        </header>

        {editingRow && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                <h3 className="text-lg font-bold text-white">Edit Row #{editingRow.rowNumber}</h3>
                <button onClick={() => setEditingRow(null)} className="text-slate-500 hover:text-white"><XCircle className="w-5 h-5"/></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Date</label>
                    <input 
                      type="text" 
                      defaultValue={editingRow.date} 
                      id="edit-date"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Amount</label>
                    <input 
                      type="text" 
                      defaultValue={editingRow.amount} 
                      id="edit-amount"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Currency</label>
                    <input 
                      type="text" 
                      defaultValue={editingRow.currency} 
                      id="edit-currency"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500 uppercase" 
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                  <input 
                    type="text" 
                    defaultValue={editingRow.description} 
                    id="edit-desc"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Paid By</label>
                  <input 
                    type="text" 
                    defaultValue={editingRow.paid_by} 
                    id="edit-payer"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Split With / Details</label>
                  <input 
                    type="text" 
                    defaultValue={editingRow.split_details || editingRow.split_with} 
                    id="edit-split"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500" 
                  />
                </div>
              </div>
              <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex justify-end gap-3">
                <button onClick={() => setEditingRow(null)} className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white">Cancel</button>
                <button 
                  onClick={() => {
                    handleEditRowSave(editingRow.rowNumber, {
                      date: document.getElementById('edit-date').value,
                      amount: document.getElementById('edit-amount').value,
                      currency: document.getElementById('edit-currency').value,
                      description: document.getElementById('edit-desc').value,
                      paid_by: document.getElementById('edit-payer').value,
                      split_details: document.getElementById('edit-split').value,
                    });
                  }}
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg shadow-md"
                >
                  Save & Re-evaluate
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {!batchId && !uploading && (
          <div className="max-w-xl mx-auto relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-brand-500 to-indigo-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative glassmorphism rounded-2xl p-12 text-center border border-slate-800 border-dashed hover:border-brand-500/50 transition-colors cursor-pointer"
                 onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-10 h-10 text-brand-400 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">Upload CSV File</h3>
              <p className="text-slate-400 text-sm mb-6">Drop your splitwise or custom spreadsheet here.</p>
              <button className="px-6 py-2.5 gradient-brand rounded-xl text-white font-semibold shadow-lg hover:opacity-95 transition-opacity text-sm">
                Select File
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".csv"
                onChange={handleFileUpload}
              />
            </div>
          </div>
        )}

        {uploading && !batchId && (
          <div className="text-center py-20">
            <div className="animate-spin w-10 h-10 border-4 border-brand-500/30 border-t-brand-500 rounded-full mx-auto mb-6"></div>
            <p className="text-slate-300 font-medium">Running Anomaly Detection Pipeline...</p>
            <p className="text-slate-500 text-sm mt-2">Checking dates, currencies, payers, and percentage math.</p>
          </div>
        )}

        {batchId && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-6 glassmorphism rounded-2xl mb-6">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  {isHistoryMode ? `Workspace Overview` : `Import Batch #${batchId} Analysis Results`}
                </h3>
                <p className="text-slate-400 text-sm mt-1">
                  Detected <span className="font-semibold text-brand-400">{anomalies.length} anomalies</span>. 
                  {pendingApprovals.length > 0 ? (
                    <span> Please review and action the remaining <span className="font-semibold text-yellow-400">{pendingApprovals.length} items</span> requiring approval.</span>
                  ) : (
                    <span className="text-green-400"> All anomalies resolved! Your balances are updated.</span>
                  )}
                </p>
              </div>

              <div className="flex gap-3">
                {pendingApprovals.length === 0 && !isHistoryMode && (
                  <button
                    onClick={() => navigate(`/groups/${gId}`)}
                    className="px-5 py-2.5 gradient-brand text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-md hover:opacity-95 transition-opacity"
                  >
                    <span>Finish Import</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
                {isHistoryMode && (
                  <button
                    onClick={() => navigate('/')}
                    className="px-5 py-2.5 bg-slate-800 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-md hover:opacity-95 transition-opacity"
                  >
                    <span>Back to Dashboard</span>
                  </button>
                )}
              </div>
            </div>

            {hasUnresolvedCriticalAnomalies ? (
              <div className="p-8 mb-8 glassmorphism rounded-2xl border border-yellow-500/30 text-center bg-yellow-500/5">
                 <ShieldAlert className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                 <h3 className="text-xl font-bold text-yellow-400 mb-2">Final Chart Locked</h3>
                 <p className="text-slate-300 text-sm max-w-xl mx-auto">
                   You have critical anomalies (like duplicate expenses or missing payers) that require your intervention. Please resolve or edit them below to unlock the final payment chart.
                 </p>
              </div>
            ) : csvBalances && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div className="glassmorphism p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">Raw CSV Settlements</h3>
                    {csvBalances.recommendations?.length === 0 ? (
                      <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 p-3 rounded-lg">
                        All debts settled based on raw CSV data!
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {csvBalances.recommendations?.map((rec, idx) => (
                          <div key={idx} className="flex justify-between items-center p-2.5 bg-slate-900/60 border border-slate-800 rounded-lg">
                            <div className="text-xs">
                              <span className="font-bold text-red-400">{rec.from_user_name}</span>
                              <span className="text-slate-500 mx-1.5">pays</span>
                              <span className="font-bold text-green-400">{rec.to_user_name}</span>
                            </div>
                            <span className="font-mono font-bold text-slate-200 text-sm">
                              {rec.amount_inr.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="glassmorphism p-5 rounded-2xl border border-slate-800">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">Raw CSV Balances</h3>
                  <div className="space-y-2 overflow-y-auto max-h-40 pr-2 custom-scrollbar">
                    {csvBalances.breakdowns?.map(b => {
                      const isOwed = b.net > 0;
                      const isZero = Math.abs(b.net) < 0.1;
                      return (
                        <div key={b.name} className="flex justify-between items-center p-2.5 bg-slate-900/40 border border-slate-800/50 rounded-lg">
                          <span className="font-bold text-slate-200 text-sm">{b.name}</span>
                          <span className={`font-mono text-sm font-bold ${isZero ? 'text-slate-500' : isOwed ? 'text-green-400' : 'text-red-400'}`}>
                            {isZero ? 'Settled' : isOwed ? `+${b.net.toFixed(2)}` : `-${Math.abs(b.net).toFixed(2)}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Panel: Spreadsheet Preview */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex justify-between items-center px-2">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    Spreadsheet Preview
                  </h3>
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 text-sm text-brand-400 hover:text-brand-300 transition-colors"
                  >
                    {isExpanded ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
                    <span>{isExpanded ? 'Shrink Table' : 'Expand Table'}</span>
                  </button>
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
                        {(isExpanded ? csvRows : csvRows.slice(0, 11)).map((row, idx) => {
                          const allRowAnomalies = anomalies.filter(a => a.row_number === row.rowNumber);
                          const rowAnomalies = allRowAnomalies.filter(a => a.requires_approval);
                          const unapprovedAnomalies = rowAnomalies.filter(a => !a.approved_at);
                          
                          const duplicateAnomaly = rowAnomalies.find(a => a.anomaly_type === 'DUPLICATE_EXPENSE');
                          const originalDuplicateAnomaly = allRowAnomalies.find(a => a.anomaly_type === 'DUPLICATE_EXPENSE_ORIGINAL');
                          const casingAnomaly = rowAnomalies.find(a => a.anomaly_type === 'SIMILAR_PAYER_FOUND');
                          
                          let bgClass = 'hover:bg-slate-900/40';
                          if (duplicateAnomaly || originalDuplicateAnomaly) bgClass = 'bg-amber-950/20 hover:bg-amber-950/30';
                          else if (casingAnomaly) bgClass = 'bg-indigo-950/20 hover:bg-indigo-950/30';
                          else if (rowAnomalies.length > 0) bgClass = 'bg-brand-950/20 hover:bg-brand-950/30';

                          return (
                            <tr key={idx} id={`row-${row.rowNumber}`} className={`transition-all duration-500 ${bgClass}`}>
                              <td className="p-3 font-mono text-center text-xs text-slate-500">{row.rowNumber}</td>
                              <td className="p-3">{row.date}</td>
                              <td className="p-3">{row.description}</td>
                              <td className="p-3">
                                {casingAnomaly ? (
                                  <div>
                                    <span className="font-bold text-indigo-400">{row.paid_by}</span>
                                  </div>
                                ) : (
                                  row.paid_by
                                )}
                              </td>
                              <td className="p-3">
                                {renderAmount(row.amount)}
                              </td>
                              <td className="p-3">{row.currency}</td>
                              <td className="p-3 max-w-xs truncate" title={row.split_details || row.split_with}>
                                {row.split_details || row.split_with}
                              </td>
                              <td className="p-3 text-xs">
                                {unapprovedAnomalies.map(anomaly => {
                                  let titleColor = "text-brand-400";
                                  if (anomaly.anomaly_type === 'DUPLICATE_EXPENSE') titleColor = "text-amber-400";
                                  else if (anomaly.anomaly_type === 'SIMILAR_PAYER_FOUND') titleColor = "text-indigo-400";

                                  return (
                                    <div key={anomaly.id} className="flex items-center gap-1.5 mb-1.5">
                                      <ShieldAlert className={`w-3.5 h-3.5 ${titleColor}`} />
                                      <span className={`${titleColor} font-bold uppercase tracking-wider text-[10px]`}>
                                        {anomaly.anomaly_type.replace(/_/g, ' ')}
                                      </span>
                                    </div>
                                  );
                                })}
                                {originalDuplicateAnomaly && (
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500/50" />
                                    <span className="text-amber-500/50 font-bold uppercase tracking-wider text-[10px]">
                                      Original Entry
                                    </span>
                                  </div>
                                )}
                                {rowAnomalies.length > 0 && unapprovedAnomalies.length === 0 && (
                                  <span className="text-green-400 font-bold tracking-wider text-[10px] uppercase flex items-center gap-1.5">
                                    <CheckCircle className="w-3.5 h-3.5"/> Resolved
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Right Panel: Anomalies Sidebar */}
              <div className="lg:col-span-1 space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2 px-2">
                  Anomaly Checklist
                </h3>
                <div className="space-y-3 relative">
                  {uploading && (
                    <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center rounded-xl border border-slate-800/50">
                      <div className="animate-spin w-8 h-8 border-4 border-brand-500/30 border-t-brand-500 rounded-full mb-3"></div>
                      <p className="text-sm font-semibold text-brand-400 animate-pulse">Re-evaluating...</p>
                    </div>
                  )}
                  {anomalies.map((a) => {
                    const isApproved = !!a.approved_at;
                    if (isApproved && !a.requires_approval) return null; // hide dismissed minor anomalies
                    return (
                      <div 
                        key={a.id} 
                        onClick={() => {
                          const el = document.getElementById(`row-${a.row_number}`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.classList.add('bg-white/10');
                            setTimeout(() => el.classList.remove('bg-white/10'), 1500);
                          }
                        }}
                        className={`p-4 rounded-xl border cursor-pointer transition-colors ${isApproved ? 'bg-green-500/5 border-green-500/20 hover:bg-green-500/10' : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/60'} glassmorphism`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isApproved ? 'bg-green-950/45 text-green-400' : a.requires_approval ? 'bg-yellow-950/45 text-yellow-400' : 'bg-indigo-950/45 text-indigo-400'
                          }`}>
                            Row {a.row_number}: {a.anomaly_type.replace(/_/g, ' ')}
                          </span>
                          {isApproved && <CheckCircle className="w-4 h-4 text-green-500" />}
                        </div>
                        <p className="text-sm text-slate-300 mb-3">{a.description}</p>
                        
                        {!isApproved && (
                          <div className="flex gap-2 justify-end mt-2">
                            {a.requires_approval ? (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditingRow(csvRows.find(r => r.rowNumber === a.row_number)); }}
                                  className="px-3 py-1.5 bg-brand-950/30 hover:bg-brand-900/50 border border-brand-500/20 text-brand-300 rounded-lg text-xs font-semibold transition-colors"
                                >
                                  Edit Row
                                </button>
                                {a.anomaly_type === 'SIMILAR_PAYER_FOUND' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleTakeAsNewUser(a); }}
                                    className="px-3 py-1.5 bg-indigo-950/30 hover:bg-indigo-900/50 border border-indigo-500/20 text-indigo-300 rounded-lg text-xs font-semibold transition-colors"
                                  >
                                    Take as different user
                                  </button>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDiscard(a.id); }}
                                  className="px-3 py-1.5 bg-red-950/30 hover:bg-red-900/50 border border-red-500/20 text-red-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Discard Row
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleApprove(a.id); }}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold transition-colors"
                              >
                                Dismiss Warning
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {anomalies.filter(a => a.requires_approval).length === 0 && anomalies.length > 0 && (
                    <div className="p-4 text-center text-sm text-slate-400">
                      No actions required.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
