import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Activity, ArrowDownToLine, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronDown,
  CircleHelp, ClipboardCheck, Database, FileSpreadsheet, Filter, Gauge, LayoutDashboard,
  LogOut, Menu, Plus, RefreshCw, Search, Settings, ShieldCheck, Sparkles, Table2, Users,
  X, Pencil, Trash2, Save, LockKeyhole, Clock3, CircleAlert, CheckCircle2, Layers3, UserPlus, UserMinus
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import QuestionBank from './QuestionBank';
import LearningProjects from './LearningProjects';

type Sheet = {
  id: string; slug: string; name: string; description: string; sort_order: number;
  table_columns: string[]; raw_columns: string[]; header_row: number | null;
  raw_row_count: number; max_column: number;
};
type Row = { id: string; sheet_id: string; view_type: 'table'|'raw'; source_row: number; sort_order: number; data: Record<string, any>; source_key?: string };
type Profile = { id: string; email: string; full_name: string; role: 'admin'|'member' };
type Toast = { kind: 'success'|'error'|'info'; text: string } | null;

const icons: Record<string, any> = {
  'executive-dashboard': LayoutDashboard, 'sql-v1': Database, 'databricks-v0': Layers3,
  'adf-skill-proficiency': Activity, 'pyspark-v0': Gauge, 'daily-timesheet': CalendarDays,
  'curriculum-topic-master': BookOpen, 'question-scenario-tracker': ClipboardCheck,
  'knowledge-assessment': CheckCircle2, 'eod-knowledge-log': Clock3, 'interview-readiness': ShieldCheck
};
const fmt = (v: any) => v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
const safeSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const colLabel = (key: string) => key.length === 1 ? `Column ${key}` : key;

export default function App() {
  const [session, setSession] = useState<Session|null>(null);
  const [profile, setProfile] = useState<Profile|null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [activeSheet, setActiveSheet] = useState<Sheet|null>(null);
  const [viewType, setViewType] = useState<'table'|'raw'>('table');
  const [rows, setRows] = useState<Row[]>([]);
  const [allRows, setAllRows] = useState<Record<string, Row[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState('All domains');
  const [toast, setToast] = useState<Toast>(null);
  const [authMode, setAuthMode] = useState<'login'|'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [modalRow, setModalRow] = useState<Row|null>(null);
  const [modalData, setModalData] = useState<Record<string, any>>({});
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [activePage, setActivePage] = useState<'overview'|'sheet'|'admin'|'questions'|'projects'>('overview');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [editingMeta, setEditingMeta] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [teamBusy, setTeamBusy] = useState(false);

  const notify = (kind: 'success'|'error'|'info', text: string) => {
    setToast({kind,text}); window.setTimeout(() => setToast(null), 3600);
  };

  const loadProfile = useCallback(async (s: Session) => {
    if (!supabase) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
    if (data) setProfile(data as Profile);
    else setProfile({id:s.user.id,email:s.user.email||'',full_name:s.user.user_metadata?.full_name||s.user.email?.split('@')[0]||'Team Member',role:'member'});
  }, []);

  const loadSheets = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('workbook_sheets').select('*').order('sort_order');
    if (error) { notify('error', error.message); return; }
    const found = (data||[]) as Sheet[];
    setSheets(found);
    setActiveSheet(prev => prev ? found.find(s=>s.id===prev.id)||found[0]||null : found[0]||null);
  }, []);

  const loadRowsFor = useCallback(async (sheet: Sheet, view: 'table'|'raw', silent=false) => {
    if (!supabase) return;
    if (!silent) setBusy(true);
    const { data, error } = await supabase.from('workbook_rows').select('*')
      .eq('sheet_id', sheet.id).eq('view_type', view).order('sort_order').limit(2500);
    if (error) notify('error', error.message);
    const loaded = (data||[]) as Row[];
    setRows(loaded);
    setAllRows(prev => ({...prev, [`${sheet.id}:${view}`]: loaded}));
    if (!silent) setBusy(false);
  }, []);

  const loadAllStructured = useCallback(async (sheetList: Sheet[]) => {
    if (!supabase) return;
    const pairs = await Promise.all(sheetList.map(async s => {
      const {data} = await supabase!.from('workbook_rows').select('*').eq('sheet_id',s.id).eq('view_type','table').order('sort_order').limit(2500);
      return [s.id, (data||[]) as Row[]] as const;
    }));
    const map: Record<string,Row[]> = {};
    pairs.forEach(([id,rs])=>map[id]=rs);
    setAllRows(prev=>({...prev,...Object.fromEntries(pairs.map(([id,rs])=>[`${id}:table`,rs]))}));
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(async ({data}) => {
      setSession(data.session);
      if (data.session) await loadProfile(data.session);
      setLoading(false);
    });
    const {data:{subscription}} = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next) await loadProfile(next);
      else { setProfile(null); setSheets([]); setRows([]); setAllRows({}); }
    });
    return () => subscription.unsubscribe();
  }, [loadProfile]);

  useEffect(() => {
    if (session && supabase) {
      loadSheets();
    }
  }, [session, loadSheets]);

  useEffect(() => {
    if (activeSheet && session) loadRowsFor(activeSheet, viewType);
  }, [activeSheet, viewType, session, loadRowsFor]);

  useEffect(() => {
    if (sheets.length && session) loadAllStructured(sheets);
  }, [sheets, session, loadAllStructured]);

  useEffect(() => {
    if (profile?.role === 'admin' && activePage === 'admin' && supabase) {
      supabase.from('profiles').select('*').order('created_at').then(({data,error})=>{
        if (error) notify('error',error.message); else setProfiles((data||[]) as Profile[]);
      });
    }
  }, [profile, activePage]);

  const activeColumns = useMemo(() => {
    if (!activeSheet) return [];
    return viewType === 'table' ? (activeSheet.table_columns||[]) : (activeSheet.raw_columns||[]);
  }, [activeSheet, viewType]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(r => Object.values(r.data||{}).some(v=>fmt(v).toLowerCase().includes(q)));
    }
    if (domainFilter !== 'All domains' && viewType==='table') {
      const key = activeSheet?.name==='Curriculum & Topic Master' ? 'Domain' :
        activeSheet?.name==='Question & Scenario Tracker' ? 'Domain' :
        ['Knowledge Assessment','EOD Knowledge Log','Interview Readiness'].includes(activeSheet?.name||'') ? 'Domain' : '';
      if (key) result = result.filter(r=>fmt(r.data?.[key])===domainFilter);
    }
    return result;
  }, [rows, query, domainFilter, viewType, activeSheet]);

  const isAdmin = profile?.role === 'admin';
  const overviewMetrics = useMemo(() => {
    const get = (name:string) => {
      const s=sheets.find(x=>x.name===name); return s ? allRows[`${s.id}:table`]||[] : [];
    };
    const tracker=get('Question & Scenario Tracker');
    const curriculum=get('Curriculum & Topic Master');
    const assessments=get('Knowledge Assessment');
    const readiness=get('Interview Readiness');
    const timesheets=get('Daily Timesheet');
    const completed=tracker.filter(r=>String(r.data?.Status||'').toLowerCase()==='completed').length;
    const inProgress=tracker.filter(r=>String(r.data?.Status||'').toLowerCase()==='in progress').length;
    const totalTopics=curriculum.length;
    const compVals=assessments.map(r=>Number(r.data?.['Final Competency (1–5)'])).filter(n=>Number.isFinite(n)&&n>0);
    const readVals=readiness.map(r=>Number(r.data?.['Final Score (1–5)'])).filter(n=>Number.isFinite(n)&&n>0);
    const avg=(a:number[])=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
    return {completed,totalQuestions:tracker.length,inProgress,totalTopics,completion:tracker.length?Math.round(completed/tracker.length*100):0,
      avgCompetency:avg(compVals),avgReadiness:avg(readVals),timesheets:timesheets.length};
  }, [sheets, allRows]);

  const domainStats = useMemo(() => {
    const trackerSheet=sheets.find(s=>s.name==='Question & Scenario Tracker');
    const curriculumSheet=sheets.find(s=>s.name==='Curriculum & Topic Master');
    const tracker=trackerSheet?allRows[`${trackerSheet.id}:table`]||[]:[];
    const curriculum=curriculumSheet?allRows[`${curriculumSheet.id}:table`]||[]:[];
    return ['SQL','PySpark','Databricks','ADF'].map(domain=>{
      const topics=curriculum.filter(r=>fmt(r.data?.Domain)===domain).length;
      const items=tracker.filter(r=>fmt(r.data?.Domain)===domain);
      const done=items.filter(r=>fmt(r.data?.Status)==='Completed').length;
      return {domain,topics,total:items.length,done,pct:items.length?Math.round(done/items.length*100):0};
    });
  },[sheets,allRows]);

  const authenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    try {
      if (authMode==='signup') {
        const {error}=await supabase.auth.signUp({email:authEmail,password:authPassword,options:{data:{full_name:authName}}});
        if(error) throw error;
        notify('success','Account created. If email confirmation is enabled, verify your email and sign in.');
      } else {
        const {error}=await supabase.auth.signInWithPassword({email:authEmail,password:authPassword});
        if(error) throw error;
        notify('success','Signed in successfully.');
      }
    } catch(err:any) { notify('error',err.message||'Authentication failed'); }
    finally { setBusy(false); }
  };

  const signOut = async () => { if(supabase) await supabase.auth.signOut(); };

  const openEdit = (row: Row) => {
    setModalRow(row); setModalData({...row.data});
  };

  const recalculate = (sheetName: string, data: Record<string,any>) => {
    const d={...data};
    if (sheetName==='Knowledge Assessment') {
      const keys=['Implementation Score (1–5)','Explain Score (1–5)','Troubleshoot Score (1–5)'];
      const vals=keys.map(k=>Number(d[k])).filter(n=>Number.isFinite(n)&&n>=1&&n<=5);
      d['Final Competency (1–5)']=vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*10)/10 : '';
    }
    if (sheetName==='Interview Readiness') {
      const keys=['Technical Correctness (1–5)','Architecture (1–5)','Production Thinking (1–5)','Troubleshooting (1–5)','Optimization (1–5)','Communication (1–5)','Follow-up Handling (1–5)','Peer Score (1–5)'];
      const vals=keys.map(k=>Number(d[k])).filter(n=>Number.isFinite(n)&&n>=1&&n<=5);
      d['Final Score (1–5)']=vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*10)/10 : '';
    }
    return d;
  };

  const saveRow = async () => {
    if(!supabase || !activeSheet || !modalRow) return;
    setBusy(true);
    try {
      const data = recalculate(activeSheet.name, modalData);
      const {error}=await supabase.from('workbook_rows').update({data,updated_by:session?.user.id,updated_at:new Date().toISOString()}).eq('id',modalRow.id);
      if(error) throw error;

      // Keep the structured and original-cell views synchronized for existing worksheet rows.
      if (modalRow.source_row > 0 && activeSheet.header_row && viewType === 'table') {
        const {data: headerRecord} = await supabase.from('workbook_rows').select('data')
          .eq('source_key', `${activeSheet.slug}:raw:${activeSheet.header_row}`).maybeSingle();
        const {data: rawRecord} = await supabase.from('workbook_rows').select('id,data')
          .eq('source_key', `${activeSheet.slug}:raw:${modalRow.source_row}`).maybeSingle();
        if (headerRecord && rawRecord) {
          const rawData = {...rawRecord.data};
          for (const [letter, header] of Object.entries(headerRecord.data as Record<string,any>)) {
            if (typeof header === 'string' && Object.prototype.hasOwnProperty.call(data, header)) {
              if (!(typeof rawData[letter] === 'string' && String(rawData[letter]).startsWith('='))) {
                rawData[letter] = data[header];
              }
            }
          }
          await supabase.from('workbook_rows').update({data:rawData,updated_by:session?.user.id,updated_at:new Date().toISOString()}).eq('id',rawRecord.id);
        }
      } else if (modalRow.source_row > 0 && activeSheet.header_row && viewType === 'raw') {
        const {data: headerRecord} = await supabase.from('workbook_rows').select('data')
          .eq('source_key', `${activeSheet.slug}:raw:${activeSheet.header_row}`).maybeSingle();
        const {data: structuredRecord} = await supabase.from('workbook_rows').select('id,data')
          .eq('sheet_id',activeSheet.id).eq('view_type','table').eq('source_row',modalRow.source_row).maybeSingle();
        if (headerRecord && structuredRecord) {
          const structuredData = {...structuredRecord.data};
          for (const [letter, header] of Object.entries(headerRecord.data as Record<string,any>)) {
            if (typeof header === 'string' && Object.prototype.hasOwnProperty.call(structuredData, header)) {
              structuredData[header] = data[letter] ?? '';
            }
          }
          const synced = recalculate(activeSheet.name, structuredData);
          await supabase.from('workbook_rows').update({data:synced,updated_by:session?.user.id,updated_at:new Date().toISOString()}).eq('id',structuredRecord.id);
        }
      }
      setModalRow(null);
      await loadRowsFor(activeSheet,viewType,true);
      await loadAllStructured(sheets);
      notify('success','Changes saved to the shared database and synchronized where the worksheet row matches.');
    } catch(err:any) { notify('error',err.message||'Could not save changes'); }
    finally { setBusy(false); }
  };

  const addRow = async () => {
    if(!supabase || !activeSheet) return;
    const blank:Record<string,any>={};
    activeColumns.forEach(c=>blank[c]='');
    if(viewType==='raw') blank['A']=activeSheet.raw_row_count+1;
    const maxOrder=rows.reduce((m,r)=>Math.max(m,r.sort_order||0),0)+1;
    setBusy(true);
    try {
      const newSourceRow = activeSheet.raw_row_count + maxOrder;
      const {data:inserted,error}=await supabase.from('workbook_rows').insert({
        source_key:`${activeSheet.slug}:${viewType}:${newSourceRow}`,
        sheet_id:activeSheet.id,view_type:viewType,source_row:newSourceRow,
        sort_order:maxOrder,data:blank,created_by:session?.user.id,updated_by:session?.user.id
      }).select('id').single();
      if(error) throw error;
      // New structured records also get a paired raw-cell row, and vice versa.
      if (viewType === 'table' && activeSheet.header_row) {
        const rawBlank:Record<string,any>={};
        (activeSheet.raw_columns||[]).forEach(c=>rawBlank[c]='');
        const {data:headerRecord}=await supabase.from('workbook_rows').select('data')
          .eq('source_key',`${activeSheet.slug}:raw:${activeSheet.header_row}`).maybeSingle();
        if(headerRecord) {
          for (const [letter, header] of Object.entries(headerRecord.data as Record<string,any>)) {
            if (typeof header==='string' && Object.prototype.hasOwnProperty.call(blank,header)) rawBlank[letter]=blank[header];
          }
        }
        await supabase.from('workbook_rows').insert({
          source_key:`${activeSheet.slug}:raw:${newSourceRow}`,
          sheet_id:activeSheet.id,view_type:'raw',source_row:newSourceRow,sort_order:newSourceRow,
          data:rawBlank,created_by:session?.user.id,updated_by:session?.user.id
        });
      } else if (viewType === 'raw' && activeSheet.header_row) {
        const {data:headerRecord}=await supabase.from('workbook_rows').select('data')
          .eq('source_key',`${activeSheet.slug}:raw:${activeSheet.header_row}`).maybeSingle();
        const tableBlank:Record<string,any>={};
        (activeSheet.table_columns||[]).forEach(c=>tableBlank[c]='');
        if(headerRecord) {
          for (const [letter, header] of Object.entries(headerRecord.data as Record<string,any>)) {
            if (typeof header==='string' && Object.prototype.hasOwnProperty.call(tableBlank,header)) tableBlank[header]=blank[letter]??'';
          }
        }
        await supabase.from('workbook_rows').insert({
          source_key:`${activeSheet.slug}:table:${newSourceRow}`,
          sheet_id:activeSheet.id,view_type:'table',source_row:newSourceRow,sort_order:newSourceRow,
          data:recalculate(activeSheet.name,tableBlank),created_by:session?.user.id,updated_by:session?.user.id
        });
      }
      await loadRowsFor(activeSheet,viewType,true);
      await loadAllStructured(sheets);
      notify('success','New editable row added.');
    } catch(err:any) { notify('error',err.message||'Could not add row'); }
    finally { setBusy(false); }
  };

  const deleteRow = async (row:Row) => {
    if(!supabase || !isAdmin) return;
    if(!window.confirm('Delete this row permanently from the shared workbook?')) return;
    const {error}=await supabase.from('workbook_rows').delete().eq('id',row.id);
    if(error) notify('error',error.message);
    else { await loadRowsFor(activeSheet!,viewType,true); await loadAllStructured(sheets); notify('success','Row deleted.'); }
  };

  const exportCsv = () => {
    const cols=activeColumns;
    const csv=[cols.map(c=>`"${c.replace(/"/g,'""')}"`).join(','),...filteredRows.map(r=>cols.map(c=>`"${fmt(r.data?.[c]).replace(/"/g,'""')}"`).join(','))].join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=`${activeSheet?.slug||'workbook'}-${viewType}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const setRole = async (p:Profile, role:'admin'|'member') => {
    if(!supabase||!isAdmin) return;
    const {error}=await supabase.from('profiles').update({role}).eq('id',p.id);
    if(error) notify('error',error.message);
    else { setProfiles(prev=>prev.map(x=>x.id===p.id?{...x,role}:x)); notify('success',`${p.full_name} is now ${role}.`); }
  };

  const inviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !isAdmin || !inviteEmail.trim()) return;
    setTeamBusy(true);
    try {
      const { error } = await supabase.functions.invoke('manage-team', {
        body: { action: 'invite', email: inviteEmail.trim(), full_name: inviteName.trim() || inviteEmail.split('@')[0] }
      });
      if (error) throw error;
      setInviteName('');
      setInviteEmail('');
      const { data, error: listError } = await supabase.from('profiles').select('*').order('created_at');
      if (listError) throw listError;
      setProfiles((data || []) as Profile[]);
      notify('success', 'Invitation sent. The new member will appear after their account is created.');
    } catch (err: any) {
      notify('error', err.message || 'Could not invite team member. Confirm the manage-team Edge Function is deployed.');
    } finally {
      setTeamBusy(false);
    }
  };

  const removeMember = async (p: Profile) => {
    if (!supabase || !isAdmin || p.role !== 'member' || p.id === profile?.id) return;
    if (!window.confirm(`Remove ${p.full_name} (${p.email}) from RecruitUss? Their sign-in account will be deleted.`)) return;
    setTeamBusy(true);
    try {
      const { error } = await supabase.functions.invoke('manage-team', {
        body: { action: 'remove', user_id: p.id }
      });
      if (error) throw error;
      setProfiles(prev => prev.filter(x => x.id !== p.id));
      notify('success', 'Team member removed.');
    } catch (err: any) {
      notify('error', err.message || 'Could not remove team member. Confirm the manage-team Edge Function is deployed.');
    } finally {
      setTeamBusy(false);
    }
  };

  const downloadWorkbookSeed = () => {
    const blob=new Blob([JSON.stringify({sheets, rows:allRows},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url;a.download='recruituss-timesheet-export.json';a.click();URL.revokeObjectURL(url);
  };

  if (!isSupabaseConfigured) {
    return <SetupScreen />;
  }
  if (loading) return <div className="loading-screen"><div className="brand-mark">RU</div><div className="spinner"/><p>Preparing your workspace…</p></div>;
  if (!session) {
    return <div className="auth-shell">
      <div className="auth-art">
        <div className="auth-brand"><div className="brand-mark">RU</div><span>RECRUITUSS</span></div>
        <div className="auth-copy"><span className="eyebrow"><Sparkles size={14}/> TEAM ENABLEMENT WORKSPACE</span>
          <h1>Turn learning<br/>into <em>readiness.</em></h1>
          <p>One shared workspace for daily execution, technical depth, and interview confidence.</p>
        </div>
        <div className="auth-bottom"><span>SQL</span><span>PySpark</span><span>Databricks</span><span>ADF</span></div>
      </div>
      <div className="auth-panel">
        <div className="auth-form-wrap">
          <div className="mobile-brand"><div className="brand-mark">RU</div><b>RecruitUss</b></div>
          <span className="eyebrow">WELCOME TO YOUR WORKSPACE</span>
          <h2>{authMode==='login'?'Sign in to RecruitUss':'Create your account'}</h2>
          <p className="muted">{authMode==='login'?'Access your team timesheet and readiness dashboard.':'Join the shared data engineering workspace.'}</p>
          <form onSubmit={authenticate} className="auth-form">
            {authMode==='signup'&&<label>Full name<input value={authName} onChange={e=>setAuthName(e.target.value)} required placeholder="Your full name"/></label>}
            <label>Work email<input type="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} required placeholder="you@company.com"/></label>
            <label>Password<input type="password" minLength={8} value={authPassword} onChange={e=>setAuthPassword(e.target.value)} required placeholder="At least 8 characters"/></label>
            <button className="btn primary wide" disabled={busy}>{busy?'Please wait…':authMode==='login'?'Sign in':'Create account'} <ArrowUpRight size={16}/></button>
          </form>
          {toast&&<div className={`toast ${toast.kind}`} role="status" aria-live="polite"><span>{toast.kind==='success'?<Check size={16}/>:toast.kind==='error'?<CircleAlert size={16}/>:<Activity size={16}/>}</span>{toast.text}<button type="button" onClick={()=>setToast(null)} aria-label="Dismiss message"><X size={14}/></button></div>}
          <p className="auth-switch">{authMode==='login'?'New to the workspace?':'Already have an account?'} <button className="text-btn" onClick={()=>setAuthMode(authMode==='login'?'signup':'login')}>{authMode==='login'?'Create an account':'Sign in'}</button></p>
          <div className="security-note"><LockKeyhole size={15}/> Secured by Supabase Authentication</div>
        </div>
      </div>
    </div>;
  }

  const navGroups = [
    {label:'WORKSPACE', items:[{page:'overview',name:'Executive overview',icon:LayoutDashboard}]},
    // Keep the member learning tools near the top so they are visible without scrolling past all workbook tabs.
    {label:'LEARNING & PRACTICE',items:[{page:'questions',name:isAdmin?'Question Bank & Review':'Answer Practice',icon:BookOpen},{page:'projects',name:'Project Lab',icon:Layers3}]},
    {label:'WORKBOOK', items:sheets.map(s=>({page:s.slug,name:s.name,icon:icons[s.slug]||FileSpreadsheet,sheet:s}))},
    ...(isAdmin?[{label:'ADMINISTRATION',items:[{page:'admin',name:'Admin & access',icon:Users}]}]:[])
  ];

  return <div className="app-shell">
    <aside className={`sidebar ${showMobileNav?'open':''}`}>
      <div className="sidebar-brand"><div className="brand-mark">RU</div><div><strong>RecruitUss</strong><small>TEAM WORKSPACE</small></div><button className="mobile-close icon-btn" onClick={()=>setShowMobileNav(false)}><X size={18}/></button></div>
      <div className="workspace-pill"><span className="live-dot"/><span>Universal DE Timesheet</span><ChevronDown size={14}/></div>
      <nav className="main-nav">
        {navGroups.map(group=><div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>
          {group.items.map((item:any)=>{const Icon=item.icon;const active=item.page==='overview'?activePage==='overview':item.page==='admin'?activePage==='admin':item.page==='questions'?activePage==='questions':item.page==='projects'?activePage==='projects':activePage==='sheet'&&activeSheet?.slug===item.page;
            return <button key={item.page} className={`nav-item ${active?'active':''}`} onClick={()=>{if(item.page==='overview'){setActivePage('overview');}else if(item.page==='admin'){setActivePage('admin');}else if(item.page==='questions'){setActivePage('questions');}else if(item.page==='projects'){setActivePage('projects');}else{setActivePage('sheet');setActiveSheet(item.sheet);setViewType('table');setQuery('');}setShowMobileNav(false);}}>
              <Icon size={17}/><span>{item.name}</span>{item.page==='question-scenario-tracker'&&<span className="nav-count">{overviewMetrics.totalQuestions}</span>}
            </button>
          })}
        </div>)}
      </nav>
      <div className="sidebar-footer"><div className="help-card"><div className="help-icon"><CircleHelp size={17}/></div><b>Need a hand?</b><p>Keep notes clear, practical, and interview-ready.</p><span>RECRUITUSS LEARNING SYSTEM</span></div>
        <div className="user-mini"><div className="avatar">{(profile?.full_name||'U').split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase()}</div><div className="user-meta"><b>{profile?.full_name||session.user.email}</b><small>{isAdmin?'Administrator':'Team member'}</small></div><button className="icon-btn" title="Sign out" onClick={signOut}><LogOut size={16}/></button></div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left"><button className="mobile-menu icon-btn" onClick={()=>setShowMobileNav(true)}><Menu size={20}/></button><div className="breadcrumbs"><span>RU RecruitUss</span><span className="crumb-slash">/</span><b>{activePage==='overview'?'Executive overview':activePage==='admin'?'Admin & access':activePage==='questions'?(isAdmin?'Question Bank & Review':'My Question Practice'):activePage==='projects'?'Project Lab':activeSheet?.name}</b></div></div>
        <div className="topbar-right"><span className="status-chip"><span className="live-dot"/> Shared database</span><button className="icon-btn" title="Refresh" onClick={()=>{loadSheets();if(activeSheet)loadRowsFor(activeSheet,viewType);}}><RefreshCw size={17}/></button><div className="top-avatar">{(profile?.full_name||'U').slice(0,1).toUpperCase()}</div></div>
      </header>

      {activePage==='overview'&&<div className="page-content">
        <div className="page-heading"><div><span className="eyebrow">TEAM PERFORMANCE / 2026</span><h1>Executive overview</h1><p>One clear view of team execution, technical competency, and interview readiness.</p></div><button className="btn secondary" onClick={downloadWorkbookSeed}><ArrowDownToLine size={16}/> Export workspace JSON</button></div>
        <div className="welcome-banner"><div className="welcome-pattern"><span/><span/><span/><span/></div><div className="welcome-copy"><span className="banner-eyebrow"><Sparkles size={14}/> UNIVERSAL DATA ENGINEERING TRACKER</span><h2>Build skills. Prove understanding.<br/><em>Become interview-ready.</em></h2><p>SQL, PySpark, Databricks and ADF — tracked in one shared place.</p></div><div className="banner-stat"><span>TRACKER COMPLETION</span><strong>{overviewMetrics.completion}%</strong><div className="progress-track"><span style={{width:`${overviewMetrics.completion}%`}}/></div><small>{overviewMetrics.completed} of {overviewMetrics.totalQuestions} scenarios completed</small></div></div>
        <section className="panel" style={{padding:16,marginBottom:18,display:'flex',alignItems:'center',justifyContent:'space-between',gap:14,flexWrap:'wrap'}}>
          <div><span className="eyebrow">TEAM LEARNING</span><h3 style={{margin:'6px 0',fontSize:15}}>Answer questions, then build projects</h3><p style={{margin:0,fontSize:11,color:'#7c879a'}}>Write your own technical answers, save drafts, submit for review, and track hands-on project milestones.</p></div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button className="btn primary" onClick={()=>setActivePage('questions')}><BookOpen size={15}/> Open Answer Practice</button>
            <button className="btn secondary" onClick={()=>setActivePage('projects')}><Layers3 size={15}/> Open Project Lab</button>
          </div>
        </section>
        <div className="metric-grid">
          <Metric icon={<ClipboardCheck size={18}/>} label="Scenarios completed" value={`${overviewMetrics.completed}`} sub={`of ${overviewMetrics.totalQuestions} tracked questions`} color="violet"/>
          <Metric icon={<Activity size={18}/>} label="In progress" value={`${overviewMetrics.inProgress}`} sub="Questions being worked on" color="blue"/>
          <Metric icon={<BookOpen size={18}/>} label="Curriculum topics" value={`${overviewMetrics.totalTopics}`} sub="Across four core domains" color="amber"/>
          <Metric icon={<Gauge size={18}/>} label="Avg. competency" value={overviewMetrics.avgCompetency?`${overviewMetrics.avgCompetency.toFixed(1)}/5`:'—'} sub="Based on completed assessments" color="green"/>
        </div>
        <div className="content-grid">
          <section className="panel domain-panel"><div className="panel-head"><div><h3>Domain completion</h3><p>Question tracker progress by technical domain</p></div><span className="small-tag">LIVE</span></div>
            <div className="domain-list">{domainStats.map((d,i)=><div className="domain-row" key={d.domain}><div className={`domain-icon d${i}`}>{d.domain==='SQL'?'SQL':d.domain==='PySpark'?'Py':d.domain==='Databricks'?'DB':'ADF'}</div><div className="domain-main"><div className="domain-title"><b>{d.domain}</b><span>{d.done}/{d.total} completed</span></div><div className="progress-track"><span style={{width:`${d.pct}%`}}/></div></div><strong className="domain-pct">{d.pct}%</strong></div>)}</div>
          </section>
          <section className="panel activity-panel"><div className="panel-head"><div><h3>Workspace snapshot</h3><p>Records loaded from your Excel workbook</p></div><FileSpreadsheet size={19} className="muted-icon"/></div>
            <div className="snapshot-grid"><div><span>Workbook sheets</span><strong>{sheets.length}</strong></div><div><span>Timesheet entries</span><strong>{overviewMetrics.timesheets}</strong></div><div><span>Interview readiness records</span><strong>{(allRows[`${sheets.find(s=>s.name==='Interview Readiness')?.id}:table`]||[]).length}</strong></div><div><span>Signed-in role</span><strong className="role-label">{isAdmin?'Admin':'Member'}</strong></div></div>
            <div className="snapshot-foot"><span className="live-dot"/> All signed-in users see the same shared workbook.</div>
          </section>
        </div>
        <section className="panel quick-access"><div className="panel-head"><div><h3>Jump into your workbook</h3><p>All 11 original worksheets are available and editable.</p></div><span className="subtle-count">11 SHEETS</span></div><div className="quick-grid">{sheets.map(s=>{const Icon=icons[s.slug]||FileSpreadsheet;return <button className="quick-card" key={s.id} onClick={()=>{setActiveSheet(s);setActivePage('sheet');setViewType('table');}}><div className="quick-icon"><Icon size={18}/></div><div><b>{s.name}</b><small>{s.description}</small></div><ArrowUpRight size={16} className="quick-arrow"/></button>})}</div></section>
      </div>}

      {activePage==='sheet'&&activeSheet&&<div className="page-content sheet-page">
        <div className="page-heading sheet-heading"><div><div className="eyebrow">{activeSheet.name==='Executive Dashboard'?'OVERVIEW & SOURCE CELLS':'WORKBOOK / '+activeSheet.name.toUpperCase()}</div><h1>{activeSheet.name}</h1><p>{activeSheet.description}</p></div><div className="heading-actions"><button className="btn secondary" onClick={exportCsv}><ArrowDownToLine size={16}/> Export CSV</button><button className="btn primary" onClick={addRow}><Plus size={16}/> Add row</button></div></div>
        <div className="sheet-toolbar panel"><div className="view-switch"><button className={viewType==='table'?'selected':''} onClick={()=>setViewType('table')}><Table2 size={15}/> Structured view</button><button className={viewType==='raw'?'selected':''} onClick={()=>setViewType('raw')}><FileSpreadsheet size={15}/> Original sheet cells</button></div>
          <div className="toolbar-filters"><div className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search rows or values…"/>{query&&<button className="clear-search" onClick={()=>setQuery('')}><X size={14}/></button>}</div>
            {viewType==='table'&&['Curriculum & Topic Master','Question & Scenario Tracker','Knowledge Assessment','EOD Knowledge Log','Interview Readiness'].includes(activeSheet.name)&&<div className="filter-select"><Filter size={14}/><select value={domainFilter} onChange={e=>setDomainFilter(e.target.value)}><option>All domains</option>{['SQL','PySpark','Databricks','ADF','Production'].map(x=><option key={x}>{x}</option>)}</select></div>}
            <button className="icon-btn bordered" title="Reload rows" onClick={()=>loadRowsFor(activeSheet,viewType)}><RefreshCw size={16}/></button>
          </div>
        </div>
        <div className="table-meta"><span>{filteredRows.length} rows <i>•</i> {activeColumns.length} columns</span><span><LockKeyhole size={13}/> Changes sync to the shared database</span></div>
        <div className="data-panel panel"><div className="table-scroll"><table className="data-table"><thead><tr><th className="row-num">#</th>{activeColumns.map(c=><th key={c}>{viewType==='raw'?colLabel(c):c}</th>)}<th className="action-col">Actions</th></tr></thead><tbody>
          {filteredRows.map((r,idx)=><tr key={r.id}><td className="row-num">{r.source_row||idx+1}</td>{activeColumns.map(c=><td key={c} title={fmt(r.data?.[c])}><span className={isStatusColumn(c)?`cell-status ${statusClass(fmt(r.data?.[c]))}`:'cell-text'}>{truncate(fmt(r.data?.[c]),viewType==='raw'?80:130)}</span></td>)}<td className="action-col"><button className="row-action" title="Edit row" onClick={()=>openEdit(r)}><Pencil size={14}/></button>{isAdmin&&<button className="row-action danger" title="Delete row" onClick={()=>deleteRow(r)}><Trash2 size={14}/></button>}</td></tr>)}
          {filteredRows.length===0&&<tr><td colSpan={activeColumns.length+2} className="empty-state"><Search size={20}/><b>No matching rows</b><span>Try another search or add a row.</span></td></tr>}
        </tbody></table></div><div className="table-footer"><span>Showing {filteredRows.length} rows</span><span>{isAdmin?'Admin: full workbook access':'Member: shared workbook edit access'}</span></div></div>
        <div className="notice-bar"><CircleAlert size={16}/><span><b>Original worksheet cells:</b> the second view preserves the workbook's raw cell values, formulas, headings, and notes. Use it for source-level inspection or correction. Structured view is optimized for daily work.</span></div>
      </div>}

      {activePage==='questions'&&profile&&<QuestionBank profile={profile}/>}
      {activePage==='projects'&&profile&&<LearningProjects profile={profile}/>}

      {activePage==='admin'&&isAdmin&&<div className="page-content">
        <div className="page-heading"><div><span className="eyebrow">CONTROL CENTER</span><h1>Admin & access</h1><p>Manage workspace roles and audit who has access to the shared workbook.</p></div><span className="admin-badge"><ShieldCheck size={16}/> Administrator access</span></div>
        <div className="metric-grid admin-metrics"><Metric icon={<Users size={18}/>} label="Registered users" value={profiles.length} sub="Accounts in this workspace" color="violet"/><Metric icon={<ShieldCheck size={18}/>} label="Administrators" value={profiles.filter(p=>p.role==='admin').length} sub="Full user-management access" color="green"/><Metric icon={<Database size={18}/>} label="Workbook sheets" value={sheets.length} sub="All source worksheets loaded" color="blue"/><Metric icon={<FileSpreadsheet size={18}/>} label="Source rows" value={sheets.reduce((n,s)=>n+s.raw_row_count,0)} sub="Original Excel row counts" color="amber"/></div>
        <section className="panel team-invite-panel">
          <div className="panel-head"><div><h3>Add a team member</h3><p>Send an email invitation to join RecruitUss.</p></div><UserPlus size={19} className="muted-icon"/></div>
          <form className="team-invite-form" onSubmit={inviteMember}>
            <label>Full name<input value={inviteName} onChange={e=>setInviteName(e.target.value)} placeholder="Team member name"/></label>
            <label>Email address<input type="email" required value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="member@company.com"/></label>
            <button className="btn primary" disabled={teamBusy}><UserPlus size={15}/>{teamBusy?'Please wait…':'Send invitation'}</button>
          </form>
          <p className="team-invite-note">Invitations and removals are processed securely by the Supabase manage-team Edge Function.</p>
        </section>
        <section className="panel admin-users"><div className="panel-head"><div><h3>Users & permissions</h3><p>Manage roles or remove a team member. Your own account cannot be removed here.</p></div><Users size={19} className="muted-icon"/></div><div className="table-scroll"><table className="data-table"><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Access</th></tr></thead><tbody>{profiles.map(p=><tr key={p.id}><td><div className="person-cell"><div className="avatar">{p.full_name.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase()}</div><b>{p.full_name}</b></div></td><td>{p.email}</td><td><span className={`role-pill ${p.role}`}>{p.role}</span></td><td><div className="team-access-actions"><select className="role-select" value={p.role} disabled={p.id===profile?.id || teamBusy} onChange={e=>setRole(p,e.target.value as any)}><option value="member">Member</option><option value="admin">Admin</option></select>{p.id===profile?.id&&<small className="muted">Current account</small>}{p.role==='member'&&p.id!==profile?.id&&<button className="btn secondary remove-member-btn" type="button" disabled={teamBusy} onClick={()=>removeMember(p)}><UserMinus size={14}/>Remove</button>}</div></td></tr>)}</tbody></table></div></section>
        <section className="panel security-panel"><div className="security-icon"><LockKeyhole size={20}/></div><div><h3>Security model</h3><p>Supabase Auth protects sign-in. Database row-level security restricts profile visibility and admin-only role management. All signed-in team members can read and edit shared workbook records; only admins can delete rows or change user roles.</p></div></section>
      </div>}
    </main>

    {modalRow&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModalRow(null)}}><div className="edit-modal"><div className="modal-head"><div><span className="eyebrow">EDIT WORKBOOK ROW</span><h2>{activeSheet?.name}</h2><p>Row {modalRow.source_row||'new'} · Changes save to the shared database</p></div><button className="icon-btn" onClick={()=>setModalRow(null)}><X size={18}/></button></div><div className="modal-body">{activeColumns.map((c,i)=><label className="edit-field" key={c}><span>{viewType==='raw'?`Column ${c} (${c})`:c}</span>{isLongField(c,modalData[c])?<textarea rows={3} value={fmt(modalData[c])} onChange={e=>setModalData(prev=>({...prev,[c]:e.target.value}))}/>:<input value={fmt(modalData[c])} onChange={e=>setModalData(prev=>({...prev,[c]:e.target.value}))} placeholder="Enter value…"/>}</label>)}</div><div className="modal-foot"><span><LockKeyhole size={14}/> Auto-calculates assessment averages when applicable</span><div><button className="btn secondary" onClick={()=>setModalRow(null)}>Cancel</button><button className="btn primary" disabled={busy} onClick={saveRow}><Save size={15}/>{busy?'Saving…':'Save changes'}</button></div></div></div></div>}
    {toast&&<div className={`toast ${toast.kind}`}><span>{toast.kind==='success'?<Check size={16}/>:toast.kind==='error'?<CircleAlert size={16}/>:<Activity size={16}/>}</span>{toast.text}<button onClick={()=>setToast(null)}><X size={14}/></button></div>}
  </div>;
}

function Metric({icon,label,value,sub,color}:{icon:React.ReactNode,label:string,value:any,sub:string,color:string}) {
  return <div className="metric-card"><div className={`metric-icon ${color}`}>{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-sub">{sub}</div><div className="metric-decoration"/></div>;
}
function truncate(s:string,n:number){return s.length>n?s.slice(0,n-1)+'…':s;}
function isStatusColumn(c:string){return ['Status','Peer Validation','Interview-Ready?','Re-test Needed?','Teach-Back','Production Scenario','Can Implement Independently?','Can Troubleshoot?','Can Teach Back?'].includes(c);}
function statusClass(s:string){const v=s.toLowerCase();if(v.includes('completed')||v==='yes'||v==='passed')return 'good';if(v.includes('progress')||v.includes('pending')||v.includes('tested'))return 'warn';if(v.includes('blocked')||v.includes('no')||v.includes('review'))return 'bad';return 'neutral';}
function isLongField(c:string,v:any){return String(c).length>24||String(v||'').length>100||/understanding|objective|completed today|blocker|feedback|notes|why|troubleshooting|gap|action|scenario|question/i.test(c);}
function SetupScreen(){
  return <div className="setup-shell"><div className="setup-card"><div className="brand-mark">RU</div><span className="eyebrow">DEPLOYMENT SETUP</span><h1>Connect your shared workspace</h1><p>The website UI is ready, but it needs your Supabase project credentials to enable authentication and shared database access.</p><ol><li>Create a Supabase project.</li><li>Copy <code>.env.example</code> to <code>.env</code> and fill in your project URL and anon key.</li><li>Run <code>supabase/schema.sql</code> in the Supabase SQL Editor.</li><li>Run <code>npm run seed</code> with the service-role key set in your local environment.</li><li>Start the app with <code>npm install</code> and <code>npm run dev</code>.</li></ol><div className="setup-warning"><LockKeyhole size={16}/><span>Never put the Supabase service-role key in a VITE_ environment variable or browser code.</span></div></div></div>;
}
