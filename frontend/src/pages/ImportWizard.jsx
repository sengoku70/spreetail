import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { importApi } from '../api';
import { Upload, ArrowLeft, ShieldAlert, CheckCircle, FileJson, XCircle, Trash2, ArrowRight, Expand, Shrink } from 'lucide-react';

export const ImportWizard = () => {
  const navigate = useNavigate();
  const [gId, setGId] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [anomalies, setAnomalies] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [batchId, setBatchId] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      await importApi.approveAnomaly(anomalyId);
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
      await importApi.discardAnomaly(anomalyId);
      setAnomalies(prev => prev.filter(a => a.id !== anomalyId));
    } catch (err) {
      alert(err.response?.data?.message || 'Discard failed.');
    }
  };

  const downloadJSONReport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(anomalies, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `import_anomaly_report_batch_${batchId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const pendingApprovals = anomalies.filter(a => a.requires_approval && !a.approved_at);

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
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <button
          onClick={() => navigate(gId ? `/groups/${gId}` : '/')}
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{gId ? 'Back to Group Details' : 'Back to Dashboard'}</span>
        </button>

        <header className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
            CSV Import Pipeline
          </h1>
          <p className="text-slate-400 text-sm">
            Upload messy spreadsheets. Our importer automatically checks and flags 18 types of data anomalies.
          </p>
        </header>

        {error && (
          <div className="p-4 mb-6 rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 text-sm flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {!batchId && (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-800 hover:border-brand-500/50 hover:bg-slate-900/10 cursor-pointer rounded-2xl p-16 text-center transition-all bg-slate-900/30 max-w-3xl mx-auto"
          >
            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-slate-300 font-medium">Analyzing spreadsheet columns & rows...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <Upload className="w-8 h-8 text-brand-400 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Select spreadsheet to import</h3>
                  <p className="text-slate-500 text-sm max-w-md mx-auto">
                    Supports columns: Date, Description, Paid By, Amount, Currency, Split Type, Split Details, Remarks
                  </p>
                </div>
                <span className="px-4 py-2 bg-brand-500 text-white rounded-lg font-semibold text-sm shadow-md hover:opacity-95 transition-opacity">
                  Choose File
                </span>
              </div>
            )}
          </div>
        )}

        {batchId && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-6 glassmorphism rounded-2xl mb-6">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  Import Batch #{batchId} Analysis Results
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
                <button
                  onClick={downloadJSONReport}
                  className="px-4 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors"
                >
                  <FileJson className="w-4 h-4 text-brand-400" />
                  <span>Download JSON Report</span>
                </button>
                {pendingApprovals.length === 0 && (
                  <button
                    onClick={() => navigate(`/groups/${gId}`)}
                    className="px-5 py-2.5 gradient-brand text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-md hover:opacity-95 transition-opacity"
                  >
                    <span>Finish Import</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

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
                          const casingAnomaly = rowAnomalies.find(a => a.anomaly_type === 'PAYER_NAME_CASING');
                          
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
                                  else if (anomaly.anomaly_type === 'PAYER_NAME_CASING') titleColor = "text-indigo-400";

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
                <div className="space-y-3">
                  {anomalies.filter(a => a.requires_approval).map((a) => {
                    const isApproved = !!a.approved_at;
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
                            isApproved ? 'bg-green-950/45 text-green-400' : 'bg-yellow-950/45 text-yellow-400'
                          }`}>
                            Row {a.row_number}: {a.anomaly_type.replace(/_/g, ' ')}
                          </span>
                          {isApproved && <CheckCircle className="w-4 h-4 text-green-500" />}
                        </div>
                        <p className="text-sm text-slate-300 mb-3">{a.description}</p>
                        
                        {!isApproved && (
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handleDiscard(a.id)}
                              className="px-3 py-1.5 bg-red-950/30 hover:bg-red-900/50 border border-red-500/20 text-red-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Discard
                            </button>
                            <button
                              onClick={() => handleApprove(a.id)}
                              className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-semibold shadow transition-colors"
                            >
                              Approve
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {anomalies.filter(a => a.requires_approval).length === 0 && (
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
