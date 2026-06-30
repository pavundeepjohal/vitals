import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://oxxuhjjtblhgqdqeeaqm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94eHVoamp0YmxoZ3FkcWVlYXFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NzMzNjIsImV4cCI6MjA5ODI0OTM2Mn0.-fcmwZRi2ZcO8rit61Oe4I7vQIvt7v1GhHXvAaB9fyA";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_USERS = ["Pavun", "User 2"];
const DEFAULT_EXERCISES = ["10,000 Steps","Cycle to Work","Squats","Deadlifts","5k Run","Tennis","Legs","Upper Body","Core","Stairmaster"];
const DEFAULT_HABITS = [
  { id:"bp-tablets", label:"Blood Pressure Tablets" },
  { id:"kefir", label:"Kefir" },
  { id:"cod-liver-oil", label:"Cod Liver Oil" },
  { id:"multivitamin", label:"Multivitamin" },
  { id:"folic-acid", label:"Folic Acid" },
];
const FOOD_OPTIONS = [
  { id:"food-on-track",  label:"On Track",              emoji:"✅", color:"#6EE7B7" },
  { id:"food-cheat-day", label:"Cheat Day — No Worries",emoji:"😌", color:"#FCD34D" },
  { id:"food-fucked-it", label:"Fucked It",             emoji:"💀", color:"#F87171" },
];
const ALCOHOL_OPTIONS = [
  { id:"alc-didnt-drink", label:"Didn't Drink",          emoji:"🧃", color:"#6EE7B7" },
  { id:"alc-cheat-day",   label:"Cheat Day — No Worries",emoji:"😌", color:"#FCD34D" },
  { id:"alc-fucked-it",   label:"Fucked It",             emoji:"🍺", color:"#F87171" },
];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ─── HELPERS ───
function toKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function todayKey() { return toKey(new Date()); }

function getStreak(data, habits) {
  const streaks = {}, best = {};
  habits.forEach(h => {
    let streak=0, d=new Date(); d.setHours(0,0,0,0);
    while (data[toKey(d)]?.habits?.[h.id]) { streak++; d.setDate(d.getDate()-1); }
    streaks[h.id] = streak;
    // calc best streak
    let b=0, cur=0;
    const keys = Object.keys(data).sort();
    keys.forEach(k => { if (data[k]?.habits?.[h.id]) { cur++; if(cur>b) b=cur; } else cur=0; });
    best[h.id] = b;
  });
  return { streaks, best };
}
function getHabitRate(data, habitId, days) {
  let hit=0, total=0, d=new Date(); d.setHours(0,0,0,0);
  for (let i=0;i<days;i++) {
    const k=toKey(d);
    if (data[k]) { total++; if (data[k]?.habits?.[habitId]) hit++; }
    d.setDate(d.getDate()-1);
  }
  return total ? Math.round((hit/total)*100) : null;
}
function getGroupStats(data, options, groupKey, days) {
  const counts={}; options.forEach(o=>counts[o.id]=0);
  let logged=0, d=new Date(); d.setHours(0,0,0,0);
  for (let i=0;i<days;i++) {
    const val=data[toKey(d)]?.food?.[groupKey];
    if (val && counts[val]!==undefined) { counts[val]++; logged++; }
    d.setDate(d.getDate()-1);
  }
  return { counts, logged };
}
function getWeeklyComparison(data, habits) {
  const calc = (offset) => {
    let habTotal=0, habDone=0, exDays=0, foodGood=0, foodLogged=0, alcGood=0, alcLogged=0;
    const d=new Date(); d.setHours(0,0,0,0);
    for (let i=0;i<7;i++) {
      const dd=new Date(d); dd.setDate(d.getDate()-(offset*7)-i);
      const k=toKey(dd); const day=data[k]||{};
      habits.forEach(h => { habTotal++; if(day.habits?.[h.id]) habDone++; });
      if ((day.exercises||[]).length>0) exDays++;
      if (day.food?.food) { foodLogged++; if(day.food.food==="food-on-track") foodGood++; }
      if (day.food?.alcohol) { alcLogged++; if(day.food.alcohol==="alc-didnt-drink") alcGood++; }
    }
    return { habPct: habTotal?Math.round((habDone/habTotal)*100):0, exDays, foodPct: foodLogged?Math.round((foodGood/foodLogged)*100):null, alcPct: alcLogged?Math.round((alcGood/alcLogged)*100):null };
  };
  return { thisWeek: calc(0), lastWeek: calc(1) };
}

// ─── SUPABASE ───
async function loadUserData(userName) {
  const { data, error } = await supabase.from("vitals_data").select("day_key, data").eq("user_name", userName);
  if (error) { console.error(error); return {}; }
  const result = {};
  data.forEach(row => { result[row.day_key] = row.data; });
  return result;
}
async function saveUserDayData(userName, dayKey, dayData) {
  await supabase.from("vitals_data").upsert(
    { user_name: userName, day_key: dayKey, data: dayData, updated_at: new Date().toISOString() },
    { onConflict: "user_name,day_key" }
  );
}
async function loadSetting(userName, key, defaultVal) {
  const { data, error } = await supabase.from("vitals_settings").select("value").eq("user_name", userName).eq("key", key).single();
  if (error || !data) return defaultVal;
  const val = data.value;
  if (Array.isArray(val) && val.length === 0) return defaultVal;
  return val;
}
async function saveSetting(userName, key, value) {
  await supabase.from("vitals_settings").upsert(
    { user_name: userName, key, value, updated_at: new Date().toISOString() },
    { onConflict: "user_name,key" }
  );
}
async function loadGlobalSetting(key, defaultVal) { return loadSetting("__global__", key, defaultVal); }
async function saveGlobalSetting(key, value) { return saveSetting("__global__", key, value); }

// ─── TOAST ───
function Toast({ message, visible }) {
  if (!visible) return null;
  return (
    <div style={S.toast}>
      <span style={S.toastIcon}>✓</span> {message}
    </div>
  );
}

// ─── SUMMARY STRIP ───
function TodaySummary({ dayData, habits, theme }) {
  const habDone = habits.filter(h => dayData.habits?.[h.id]).length;
  const exDone = (dayData.exercises||[]).length;
  const foodOpt = FOOD_OPTIONS.find(o => o.id === dayData.food?.food);
  const alcOpt = ALCOHOL_OPTIONS.find(o => o.id === dayData.food?.alcohol);
  const headerBg = foodOpt?.color || (theme==="light" ? "#f5f5f5" : "#1a1a1a");

  return (
    <div style={{...S.summaryStrip, background:`${headerBg}15`, borderColor:`${headerBg}40`}}>
      <div style={S.summaryItem}>
        <span style={S.summaryVal}>{habDone}/{habits.length}</span>
        <span style={S.summaryLab}>habits</span>
      </div>
      <div style={S.summaryDivider}/>
      <div style={S.summaryItem}>
        <span style={S.summaryVal}>{exDone}</span>
        <span style={S.summaryLab}>exercises</span>
      </div>
      <div style={S.summaryDivider}/>
      <div style={S.summaryItem}>
        <span style={{...S.summaryVal, color: foodOpt?.color || "#555"}}>{foodOpt?.emoji || "—"}</span>
        <span style={S.summaryLab}>food</span>
      </div>
      <div style={S.summaryDivider}/>
      <div style={S.summaryItem}>
        <span style={{...S.summaryVal, color: alcOpt?.color || "#555"}}>{alcOpt?.emoji || "—"}</span>
        <span style={S.summaryLab}>alcohol</span>
      </div>
    </div>
  );
}

// ─── CHOICE GROUP ───
function ChoiceGroup({ dayFood, groupKey, options, title, onSelect, theme }) {
  const selected = dayFood?.[groupKey] || null;
  const t = theme === "light" ? LT : S;
  return (
    <section style={S.section}>
      <label style={{...S.label, color: theme==="light"?"#059669":"#6EE7B7"}}>{title}</label>
      <div style={S.choiceGrid}>
        {options.map(opt => {
          const on = selected===opt.id;
          return (
            <button key={opt.id} onClick={()=>onSelect(groupKey,opt.id)}
              style={{...S.choiceBtn, borderColor:on?opt.color:"#2a2a2a", background:on?`${opt.color}18`:(theme==="light"?"#f9f9f9":"#1a1a1a"), color:on?opt.color:(theme==="light"?"#666":"#666")}}>
              <span style={S.choiceEmoji}>{opt.emoji}</span>
              <span style={S.choiceLabel}>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ─── DAY PANEL ───
function DayPanel({ dayKey, title, dayData, habits, exercises, onFoodSelect, onHabitToggle, onExToggle, onNoteChange, onMetricChange, theme, readOnly }) {
  const foodOpt = FOOD_OPTIONS.find(o => o.id === dayData.food?.food);
  const isLight = theme === "light";
  const labelColor = isLight ? "#059669" : "#6EE7B7";

  return (
    <div style={S.panel}>
      <h2 style={{...S.panelTitle, color: isLight?"#111":"#f0f0f0"}}>{title}</h2>

      {!readOnly && <TodaySummary dayData={dayData} habits={habits} theme={theme}/>}

      {readOnly ? (
        // Read-only summary for past days
        <div style={S.readOnlySummary}>
          {foodOpt && <div style={{...S.readOnlyChip, borderColor:foodOpt.color, color:foodOpt.color}}>{foodOpt.emoji} {foodOpt.label}</div>}
          {dayData.food?.alcohol && (() => { const a=ALCOHOL_OPTIONS.find(o=>o.id===dayData.food.alcohol); return a?<div style={{...S.readOnlyChip, borderColor:a.color, color:a.color}}>{a.emoji} {a.label}</div>:null; })()}
          {(dayData.exercises||[]).length>0 && <div style={S.readOnlySection}><span style={{...S.label,color:labelColor}}>Exercise</span><div style={S.exGrid}>{(dayData.exercises||[]).map(ex=><span key={ex} style={S.exBtnOn}>{ex}</span>)}</div></div>}
          {habits.filter(h=>dayData.habits?.[h.id]).length>0 && <div style={S.readOnlySection}><span style={{...S.label,color:labelColor}}>Habits done</span><div style={S.tagList}>{habits.filter(h=>dayData.habits?.[h.id]).map(h=><span key={h.id} style={S.tag}>{h.label}</span>)}</div></div>}
          {(dayData.metrics?.weight||dayData.metrics?.bp||dayData.metrics?.waist) && (
            <div style={S.readOnlySection}>
              <span style={{...S.label,color:labelColor}}>Metrics</span>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {dayData.metrics?.weight&&<span style={S.metricPill}>⚖️ {dayData.metrics.weight}kg</span>}
                {dayData.metrics?.bp&&<span style={S.metricPill}>❤️ {dayData.metrics.bp}</span>}
                {dayData.metrics?.waist&&<span style={S.metricPill}>📏 {dayData.metrics.waist}cm</span>}
              </div>
            </div>
          )}
          {dayData.notes && <div style={S.readOnlySection}><span style={{...S.label,color:labelColor}}>Notes</span><p style={{fontSize:14,color:isLight?"#333":"#aaa"}}>{dayData.notes}</p></div>}
          {!foodOpt && !(dayData.exercises||[]).length && !habits.filter(h=>dayData.habits?.[h.id]).length && <p style={S.empty}>Nothing logged for this day.</p>}
        </div>
      ) : (
        <>
          <ChoiceGroup dayFood={dayData.food} groupKey="food"    options={FOOD_OPTIONS}    title="🥗 Food"    onSelect={onFoodSelect} theme={theme}/>
          <ChoiceGroup dayFood={dayData.food} groupKey="alcohol" options={ALCOHOL_OPTIONS} title="🍷 Alcohol" onSelect={onFoodSelect} theme={theme}/>
          <section style={S.section}>
            <label style={{...S.label,color:labelColor}}>Daily habits</label>
            <div style={S.habitGrid}>
              {habits.map(h=>(
                <button key={h.id} onClick={()=>onHabitToggle(h.id)}
                  style={{...S.habitBtn,...(dayData.habits?.[h.id]?S.habitBtnOn:{}), background:dayData.habits?.[h.id]?"#1a2e25":(isLight?"#f5f5f5":"#1a1a1a")}}>
                  <span style={S.habitCheck}>{dayData.habits?.[h.id]?"✓":"○"}</span>
                  {h.label}
                </button>
              ))}
            </div>
          </section>
          <section style={S.section}>
            <label style={{...S.label,color:labelColor}}>Exercise</label>
            <div style={S.exGrid}>
              {exercises.map(ex=>(
                <button key={ex} onClick={()=>onExToggle(ex)}
                  style={{...S.exBtn,...((dayData.exercises||[]).includes(ex)?S.exBtnOn:{})}}>
                  {ex}
                </button>
              ))}
            </div>
          </section>
          <section style={S.section}>
            <label style={{...S.label,color:labelColor}}>📊 Body Metrics <span style={{color:"#444",fontWeight:400,textTransform:"none",letterSpacing:0}}>(optional)</span></label>
            <div style={S.metricsGrid}>
              <div style={{...S.metricField,background:isLight?"#f5f5f5":"#1a1a1a"}}>
                <span style={S.metricIcon}>⚖️</span>
                <div style={S.metricInputWrap}>
                  <input type="number" step="0.1" value={dayData.metrics?.weight||""} onChange={e=>onMetricChange("weight",e.target.value)} placeholder="—" style={{...S.metricInput,color:isLight?"#111":"#f0f0f0"}}/>
                  <span style={S.metricUnit}>kg</span>
                </div>
                <span style={S.metricLabel}>Weight</span>
              </div>
              <div style={{...S.metricField,background:isLight?"#f5f5f5":"#1a1a1a"}}>
                <span style={S.metricIcon}>❤️</span>
                <div style={S.metricInputWrap}>
                  <input type="text" value={dayData.metrics?.bp||""} onChange={e=>onMetricChange("bp",e.target.value)} placeholder="—" style={{...S.metricInput,color:isLight?"#111":"#f0f0f0"}} maxLength={7}/>
                </div>
                <span style={S.metricLabel}>Blood Pressure</span>
                <span style={S.metricHint}>e.g. 120/80</span>
              </div>
              <div style={{...S.metricField,background:isLight?"#f5f5f5":"#1a1a1a"}}>
                <span style={S.metricIcon}>📏</span>
                <div style={S.metricInputWrap}>
                  <input type="number" step="0.5" value={dayData.metrics?.waist||""} onChange={e=>onMetricChange("waist",e.target.value)} placeholder="—" style={{...S.metricInput,color:isLight?"#111":"#f0f0f0"}}/>
                  <span style={S.metricUnit}>cm</span>
                </div>
                <span style={S.metricLabel}>Waist</span>
              </div>
            </div>
          </section>
          <section style={S.section}>
            <label style={{...S.label,color:labelColor}}>Notes</label>
            <textarea value={dayData.notes||""} onChange={e=>onNoteChange(e.target.value)}
              placeholder="Anything else to note today..."
              style={{...S.textarea, background:isLight?"#f5f5f5":"#1a1a1a", color:isLight?"#111":"#f0f0f0"}}/>
          </section>
        </>
      )}
    </div>
  );
}

// ─── LINE CHART ───
function LineChart({ points, color, unit }) {
  const vals = points.map(p=>p.val).filter(v=>v!==null&&v!==undefined&&v!=="");
  if (vals.length < 2) return <p style={S.empty}>Log at least 2 entries to see a trend.</p>;
  const numVals = vals.map(Number);
  const min = Math.min(...numVals);
  const max = Math.max(...numVals);
  const range = max - min || 1;
  const W = 320, H = 80, PAD = 8;
  const pts = points.filter(p=>p.val!==null&&p.val!==undefined&&p.val!=="");
  const coords = pts.map((p,i) => ({
    x: PAD + (i/(pts.length-1||1))*(W-PAD*2),
    y: PAD + (1 - (Number(p.val)-min)/range) * (H-PAD*2),
    label: p.label, val: p.val
  }));
  const path = coords.map((c,i)=>`${i===0?"M":"L"}${c.x},${c.y}`).join(" ");
  return (
    <div style={{overflowX:"auto"}}>
      <svg width={W} height={H} style={{display:"block"}}>
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        {coords.map((c,i)=>(
          <g key={i}>
            <circle cx={c.x} cy={c.y} r="3" fill={color}/>
            <text x={c.x} y={H-1} textAnchor="middle" fontSize="7" fill="#555">{c.label}</text>
            <text x={c.x} y={c.y-6} textAnchor="middle" fontSize="8" fill={color}>{c.val}{unit}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── CALENDAR ───
function CalendarView({ data, habits, calMonth, setCalMonth, selectedDay, setSelectedDay, dayPanelProps, theme }) {
  const [editingDay, setEditingDay] = useState(false);
  useEffect(()=>{ setEditingDay(false); }, [selectedDay]);
  const {y,m}=calMonth;
  const first=new Date(y,m,1).getDay();
  const dim=new Date(y,m+1,0).getDate();
  const cells=[...Array(first).fill(null),...Array.from({length:dim},(_,i)=>i+1)];
  const isLight = theme==="light";
  return (
    <div style={S.panel}>
      <div style={S.calHeader}>
        <button style={S.navBtn} onClick={()=>setCalMonth(p=>{const nm=p.m===0?11:p.m-1;return{y:p.m===0?p.y-1:p.y,m:nm};})}>‹</button>
        <h2 style={{...S.panelTitle,margin:0}}>{MONTHS[m]} {y}</h2>
        <button style={S.navBtn} onClick={()=>setCalMonth(p=>{const nm=p.m===11?0:p.m+1;return{y:p.m===11?p.y+1:p.y,m:nm};})}>›</button>
      </div>
      <div style={S.calGrid}>
        {DAYS.map(d=><div key={d} style={S.calDayLabel}>{d}</div>)}
        {cells.map((d,i)=>{
          if (!d) return <div key={`e${i}`}/>;
          const key=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
          const dd=data[key]||{};
          const fOpt=FOOD_OPTIONS.find(o=>o.id===dd.food?.food);
          const aOpt=ALCOHOL_OPTIONS.find(o=>o.id===dd.food?.alcohol);
          const hasEx=(dd.exercises||[]).length>0;
          const habDone=habits.filter(h=>dd.habits?.[h.id]).length;
          const isToday=key===todayKey();
          const isFuture=key>todayKey();
          return (
            <button key={key} onClick={()=>!isFuture&&setSelectedDay(key)}
              style={{...S.calCell, background:isLight?"#f5f5f5":"#1a1a1a", border:`1px solid ${isToday?"#6EE7B7":(isLight?"#e0e0e0":"#222")}`, opacity:isFuture?0.3:1, cursor:isFuture?"default":"pointer"}}>
              <span style={{...S.calDate, color:isLight?"#111":"#f0f0f0"}}>{d}</span>
              <div style={S.calDots}>
                {fOpt&&<span style={{...S.dot,background:fOpt.color}}/>}
                {aOpt&&<span style={{...S.dot,background:aOpt.color}}/>}
                {hasEx&&<span style={{...S.dot,background:"#93C5FD"}}/>}
                {habDone>0&&<span style={{...S.dot,background:"#C4B5FD"}}/>}
              </div>
            </button>
          );
        })}
      </div>
      {selectedDay&&(
        <div style={S.modal}>
          <div style={{...S.modalBox, background:isLight?"#fff":"#111"}}>
            <div style={S.modalHeader}>
              <button style={S.closeBtn} onClick={()=>{setSelectedDay(null);setEditingDay(false);}}>✕</button>
              {selectedDay!==todayKey()&&(
                <button style={{...S.editDayBtn, color:editingDay?"#F87171":"#6EE7B7", borderColor:editingDay?"#F87171":"#6EE7B7"}}
                  onClick={()=>setEditingDay(e=>!e)}>
                  {editingDay?"✕ Cancel":"✏️ Edit day"}
                </button>
              )}
            </div>
            <DayPanel dayKey={selectedDay} title={selectedDay} {...dayPanelProps(selectedDay)}
              readOnly={selectedDay!==todayKey()&&!editingDay} theme={theme}/>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── INSIGHTS ───
function InsightsView({ data, habits, insightRange, setInsightRange, theme }) {
  const { streaks, best } = getStreak(data, habits);
  const foodStats=getGroupStats(data,FOOD_OPTIONS,"food",insightRange);
  const alcStats=getGroupStats(data,ALCOHOL_OPTIONS,"alcohol",insightRange);
  const { thisWeek, lastWeek } = getWeeklyComparison(data, habits);
  const isLight = theme==="light";
  const labelColor = isLight?"#059669":"#6EE7B7";

  let exDays=0, dd=new Date(); dd.setHours(0,0,0,0);
  for (let i=0;i<insightRange;i++) { if((data[toKey(dd)]?.exercises||[]).length>0) exDays++; dd.setDate(dd.getDate()-1); }

  // Build metric trend points
  const metricPoints = (field) => {
    const pts=[]; const d=new Date(); d.setHours(0,0,0,0);
    for(let i=insightRange-1;i>=0;i--){
      const dd2=new Date(d); dd2.setDate(d.getDate()-i);
      const k=toKey(dd2); const val=data[k]?.metrics?.[field];
      if(val) pts.push({label:`${dd2.getDate()}/${dd2.getMonth()+1}`,val});
    }
    return pts;
  };

  function PieBar({options,stats}) {
    return (
      <div style={S.pieBarWrap}>
        {options.map(opt=>{
          const count=stats.counts[opt.id]||0;
          const pct=stats.logged?Math.round((count/stats.logged)*100):0;
          return (
            <div key={opt.id} style={S.pieBarRow}>
              <span style={S.pieBarEmoji}>{opt.emoji}</span>
              <div style={S.pieBarTrack}><div style={{...S.pieBarFill,width:`${pct}%`,background:opt.color}}/></div>
              <span style={{...S.pieBarCount,color:opt.color}}>{count}d</span>
              <span style={S.pieBarPct}>{pct}%</span>
            </div>
          );
        })}
        {stats.logged===0&&<p style={S.empty}>No data logged yet.</p>}
      </div>
    );
  }

  function Delta({ now, prev, label, suffix="%" }) {
    if (prev===null||now===null) return null;
    const diff = now - prev;
    const color = diff>0?"#6EE7B7":diff<0?"#F87171":"#555";
    return <span style={{fontSize:11,color}}>{diff>0?"+":""}{diff}{suffix} vs last week</span>;
  }

  return (
    <div style={S.panel}>
      <div style={S.insightHeader}>
        <h2 style={{...S.panelTitle,margin:0}}>Insights</h2>
        <div style={S.rangeToggle}>
          {[7,30,90].map(r=>(
            <button key={r} onClick={()=>setInsightRange(r)}
              style={{...S.rangeBtn,...(insightRange===r?S.rangeBtnOn:{})}}>
              {r}d
            </button>
          ))}
        </div>
      </div>

      {/* Weekly comparison */}
      <section style={S.section}>
        <label style={{...S.label,color:labelColor}}>📅 This week vs last week</label>
        <div style={S.weekGrid}>
          <div style={{...S.weekCard, background:isLight?"#f5f5f5":"#1a1a1a"}}>
            <div style={S.weekVal}>{thisWeek.habPct}%</div>
            <div style={S.weekLab}>Habits</div>
            <Delta now={thisWeek.habPct} prev={lastWeek.habPct}/>
          </div>
          <div style={{...S.weekCard, background:isLight?"#f5f5f5":"#1a1a1a"}}>
            <div style={S.weekVal}>{thisWeek.exDays}d</div>
            <div style={S.weekLab}>Exercise</div>
            <Delta now={thisWeek.exDays} prev={lastWeek.exDays} suffix="d"/>
          </div>
          {thisWeek.foodPct!==null&&<div style={{...S.weekCard, background:isLight?"#f5f5f5":"#1a1a1a"}}>
            <div style={S.weekVal}>{thisWeek.foodPct}%</div>
            <div style={S.weekLab}>Food on track</div>
            <Delta now={thisWeek.foodPct} prev={lastWeek.foodPct}/>
          </div>}
          {thisWeek.alcPct!==null&&<div style={{...S.weekCard, background:isLight?"#f5f5f5":"#1a1a1a"}}>
            <div style={S.weekVal}>{thisWeek.alcPct}%</div>
            <div style={S.weekLab}>Sober days</div>
            <Delta now={thisWeek.alcPct} prev={lastWeek.alcPct}/>
          </div>}
        </div>
      </section>

      <section style={S.section}>
        <label style={{...S.label,color:labelColor}}>🥗 Food — last {insightRange} days ({foodStats.logged} logged)</label>
        <PieBar options={FOOD_OPTIONS} stats={foodStats}/>
      </section>
      <section style={S.section}>
        <label style={{...S.label,color:labelColor}}>🍷 Alcohol — last {insightRange} days ({alcStats.logged} logged)</label>
        <PieBar options={ALCOHOL_OPTIONS} stats={alcStats}/>
      </section>
      <section style={S.section}>
        <label style={{...S.label,color:labelColor}}>💪 Exercise — last {insightRange} days</label>
        <div style={S.exStat}>
          <span style={S.exBigNum}>{exDays}</span>
          <span style={S.exOf}> / {insightRange} days active</span>
        </div>
        <div style={S.progressBar}><div style={{...S.progressFill,width:`${(exDays/insightRange)*100}%`}}/></div>
      </section>
      <section style={S.section}>
        <label style={{...S.label,color:labelColor}}>Habit streaks</label>
        <div style={S.streakGrid}>
          {habits.map(h=>(
            <div key={h.id} style={{...S.streakCard, background:isLight?"#f5f5f5":"#1a1a1a"}}>
              <div style={S.streakNum}>{streaks[h.id]||0}</div>
              <div style={S.streakLabel}>{h.label}</div>
              <div style={S.streakSub}>current streak</div>
              <div style={{...S.streakSub,color:"#FCD34D",marginTop:2}}>best: {best[h.id]||0} days</div>
              <div style={S.streakRate}>{getHabitRate(data,h.id,insightRange)!==null?`${getHabitRate(data,h.id,insightRange)}% last ${insightRange}d`:"No data yet"}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Metric trend charts */}
      {metricPoints("weight").length>=2&&<section style={S.section}>
        <label style={{...S.label,color:labelColor}}>⚖️ Weight trend</label>
        <LineChart points={metricPoints("weight")} color="#6EE7B7" unit="kg"/>
      </section>}
      {metricPoints("waist").length>=2&&<section style={S.section}>
        <label style={{...S.label,color:labelColor}}>📏 Waist trend</label>
        <LineChart points={metricPoints("waist")} color="#93C5FD" unit="cm"/>
      </section>}
      {metricPoints("bp").length>=2&&<section style={S.section}>
        <label style={{...S.label,color:labelColor}}>❤️ Blood pressure log</label>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {metricPoints("bp").map((p,i)=>(
            <div key={i} style={{display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontSize:11,color:"#555",minWidth:40}}>{p.label}</span>
              <span style={{fontSize:14,color:"#F87171",fontWeight:600}}>{p.val}</span>
            </div>
          ))}
        </div>
      </section>}
    </div>
  );
}

// ─── SETTINGS ───
function SettingsView({ habits, exercises, users, currentUser, saveHabits, saveExercises, saveData, saveUsers, theme, setTheme }) {
  const [newHabit,    setNewHabit]    = useState("");
  const [newExercise, setNewExercise] = useState("");
  const [newUser,     setNewUser]     = useState("");
  const [editHabits,  setEditHabits]  = useState(false);
  const [editEx,      setEditEx]      = useState(false);
  const [editUsers,   setEditUsers]   = useState(false);
  const isLight = theme==="light";
  const labelColor = isLight?"#059669":"#6EE7B7";

  function addHabit() { const t=newHabit.trim(); if(!t) return; saveHabits([...habits,{id:t.toLowerCase().replace(/\s+/g,"-")+"-"+Date.now(),label:t}]); setNewHabit(""); }
  function addExercise() { const t=newExercise.trim(); if(!t) return; saveExercises([...exercises,t]); setNewExercise(""); }
  function addUser() { const t=newUser.trim(); if(!t||users.includes(t)) return; saveUsers([...users,t]); setNewUser(""); }

  return (
    <div style={S.panel}>
      <h2 style={{...S.panelTitle,color:isLight?"#111":"#f0f0f0"}}>Settings</h2>

      <section style={S.section}>
        <label style={{...S.label,color:labelColor}}>Appearance</label>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>setTheme("dark")}
            style={{...S.themeBtn, borderColor:theme==="dark"?"#6EE7B7":"#2a2a2a", color:theme==="dark"?"#6EE7B7":"#aaa", background:"#111"}}>
            🌙 Dark
          </button>
          <button onClick={()=>setTheme("light")}
            style={{...S.themeBtn, borderColor:theme==="light"?"#6EE7B7":"#ddd", color:theme==="light"?"#059669":"#666", background:isLight?"#f5f5f5":"#1a1a1a"}}>
            ☀️ Light
          </button>
        </div>
      </section>

      <section style={S.section}>
        <div style={S.sectionHeader}>
          <label style={{...S.label,color:labelColor}}>Users</label>
          <button style={S.editBtn} onClick={()=>setEditUsers(e=>!e)}>{editUsers?"Done":"Edit"}</button>
        </div>
        <div style={S.tagList}>
          {users.map(u=>(
            <div key={u} style={{...S.tag,...(u===currentUser?S.tagActive:{})}}>
              {u}
              {editUsers && u!==currentUser && users.length>1 && (
                <button style={S.removeBtn} onClick={()=>saveUsers(users.filter(x=>x!==u))}>✕</button>
              )}
            </div>
          ))}
        </div>
        <div style={S.addRow}>
          <input value={newUser} onChange={e=>setNewUser(e.target.value)} placeholder="Add user..." style={{...S.addInput,background:isLight?"#f5f5f5":"#1a1a1a",color:isLight?"#111":"#f0f0f0"}} onKeyDown={e=>{if(e.key==="Enter") addUser();}}/>
          <button style={S.addBtn} onClick={addUser}>Add</button>
        </div>
      </section>

      <section style={S.section}>
        <div style={S.sectionHeader}>
          <label style={{...S.label,color:labelColor}}>Daily habits</label>
          <button style={S.editBtn} onClick={()=>setEditHabits(e=>!e)}>{editHabits?"Done":"Edit"}</button>
        </div>
        <div style={S.tagList}>
          {habits.map(h=>(<div key={h.id} style={S.tag}>{h.label}{editHabits&&<button style={S.removeBtn} onClick={()=>saveHabits(habits.filter(x=>x.id!==h.id))}>✕</button>}</div>))}
        </div>
        <div style={S.addRow}>
          <input value={newHabit} onChange={e=>setNewHabit(e.target.value)} placeholder="Add new habit..." style={{...S.addInput,background:isLight?"#f5f5f5":"#1a1a1a",color:isLight?"#111":"#f0f0f0"}} onKeyDown={e=>{if(e.key==="Enter") addHabit();}}/>
          <button style={S.addBtn} onClick={addHabit}>Add</button>
        </div>
      </section>

      <section style={S.section}>
        <div style={S.sectionHeader}>
          <label style={{...S.label,color:labelColor}}>Exercise list</label>
          <button style={S.editBtn} onClick={()=>setEditEx(e=>!e)}>{editEx?"Done":"Edit"}</button>
        </div>
        <div style={S.tagList}>
          {exercises.map(ex=>(<div key={ex} style={S.tag}>{ex}{editEx&&<button style={S.removeBtn} onClick={()=>saveExercises(exercises.filter(e=>e!==ex))}>✕</button>}</div>))}
        </div>
        <div style={S.addRow}>
          <input value={newExercise} onChange={e=>setNewExercise(e.target.value)} placeholder="Add exercise..." style={{...S.addInput,background:isLight?"#f5f5f5":"#1a1a1a",color:isLight?"#111":"#f0f0f0"}} onKeyDown={e=>{if(e.key==="Enter") addExercise();}}/>
          <button style={S.addBtn} onClick={addExercise}>Add</button>
        </div>
      </section>

      <section style={S.section}>
        <label style={{...S.label,color:labelColor}}>Reset &amp; Data</label>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <button style={S.resetBtn} onClick={()=>{if(window.confirm("Reset exercise list to defaults?")) saveExercises(DEFAULT_EXERCISES);}}>Reset exercise list to defaults</button>
          <button style={S.resetBtn} onClick={()=>{if(window.confirm("Reset habit list to defaults?")) saveHabits(DEFAULT_HABITS);}}>Reset habit list to defaults</button>
          <button style={S.dangerBtn} onClick={()=>{if(window.confirm(`Clear all data for ${currentUser}? Cannot be undone.`)) saveData({});}}>Clear my logged data</button>
        </div>
      </section>

      <section style={S.section}>
        <label style={{...S.label,color:labelColor}}>Add to home screen</label>
        <p style={{fontSize:13,color:"#666",lineHeight:1.5}}>
          iPhone: tap the Share icon in Safari → "Add to Home Screen"{"\n"}
          Android: tap the three dots menu → "Add to Home Screen"
        </p>
      </section>
    </div>
  );
}

// ─── USER PICKER ───
function UserPicker({ users, currentUser, onSelect, onRename }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    return () => { document.removeEventListener("mousedown", handleClick); document.removeEventListener("touchstart", handleClick); };
  }, [open]);

  return (
    <div style={S.pickerWrap} ref={ref}>
      <button style={S.pickerBtn} onClick={()=>setOpen(o=>!o)}>
        <span style={S.pickerAvatar}>{currentUser[0].toUpperCase()}</span>
        <span style={S.pickerName}>{currentUser}</span>
        <span style={{fontSize:10,color:"#555",marginLeft:2}}>{open?"▲":"▼"}</span>
      </button>
      {open&&(
        <div style={S.pickerDropdown}>
          {users.map(u=>(
            <div key={u} style={{display:"flex",alignItems:"center"}}>
              {renaming===u ? (
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",width:"100%"}}>
                  <input autoFocus value={renameVal} onChange={e=>setRenameVal(e.target.value)}
                    style={{flex:1,background:"#222",border:"1px solid #444",borderRadius:6,padding:"4px 8px",color:"#f0f0f0",fontSize:13,outline:"none"}}
                    onKeyDown={e=>{
                      if(e.key==="Enter"&&renameVal.trim()){onRename(u,renameVal.trim());setRenaming(null);}
                      if(e.key==="Escape") setRenaming(null);
                    }}/>
                  <button style={{background:"none",border:"none",color:"#6EE7B7",cursor:"pointer",fontSize:12}} onClick={()=>{if(renameVal.trim()){onRename(u,renameVal.trim());setRenaming(null);}}}>✓</button>
                </div>
              ) : (
                <button style={{...S.pickerOption,...(u===currentUser?S.pickerOptionActive:{})}} onClick={()=>{onSelect(u);setOpen(false);}}>
                  <span style={{...S.pickerAvatar,fontSize:12,width:22,height:22,lineHeight:"22px"}}>{u[0].toUpperCase()}</span>
                  {u}
                  <span style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
                    {u===currentUser&&<span style={{fontSize:10,color:"#6EE7B7"}}>✓</span>}
                    <span style={{fontSize:10,color:"#444"}} onClick={e=>{e.stopPropagation();setRenaming(u);setRenameVal(u);}}>✏️</span>
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ───
export default function HealthTracker() {
  const [users,        setUsers]        = useState(DEFAULT_USERS);
  const [currentUser,  setCurrentUser]  = useState(DEFAULT_USERS[0]);
  const [data,         setData]         = useState({});
  const [exercises,    setExercises]    = useState(DEFAULT_EXERCISES);
  const [habits,       setHabits]       = useState(DEFAULT_HABITS);
  const [view,         setView]         = useState("today");
  const [calMonth,     setCalMonth]     = useState(()=>{const d=new Date();return{y:d.getFullYear(),m:d.getMonth()};});
  const [selectedDay,  setSelectedDay]  = useState(null);
  const [insightRange, setInsightRange] = useState(30);
  const [loading,      setLoading]      = useState(true);
  const [theme,        setThemeState]   = useState("dark");
  const [toast,        setToast]        = useState({ visible:false, message:"" });
  const saveTimers = useRef({});

  const isLight = theme === "light";

  function showToast(msg="Saved ✓") {
    setToast({visible:true,message:msg});
    setTimeout(()=>setToast({visible:false,message:""}),2000);
  }

  async function setTheme(t) {
    setThemeState(t);
    await saveGlobalSetting("theme", t);
  }

  useEffect(()=>{
    async function init() {
      const savedUsers = await loadGlobalSetting("users", DEFAULT_USERS);
      const savedCurrentUser = await loadGlobalSetting("current-user", DEFAULT_USERS[0]);
      const savedTheme = await loadGlobalSetting("theme", "dark");
      setUsers(savedUsers);
      setCurrentUser(savedCurrentUser);
      setThemeState(savedTheme);
    }
    init();
  },[]);

  useEffect(()=>{
    async function load() {
      setLoading(true); setData({});
      const [userData, exData, habData] = await Promise.all([
        loadUserData(currentUser),
        loadSetting(currentUser, "exercises", DEFAULT_EXERCISES),
        loadSetting(currentUser, "habits", DEFAULT_HABITS),
      ]);
      setData(userData);
      setExercises(Array.isArray(exData)&&exData.length>0?exData:DEFAULT_EXERCISES);
      setHabits(Array.isArray(habData)&&habData.length>0?habData:DEFAULT_HABITS);
      setSelectedDay(null); setLoading(false);
    }
    load();
  },[currentUser]);

  function saveDayData(newData, dayKey, dayValue) {
    setData(newData);
    if (saveTimers.current[dayKey]) clearTimeout(saveTimers.current[dayKey]);
    saveTimers.current[dayKey] = setTimeout(async () => {
      await saveUserDayData(currentUser, dayKey, dayValue);
      showToast("Saved");
    }, 800);
  }

  const saveExercises = useCallback(async (list) => { setExercises(list); await saveSetting(currentUser,"exercises",list); showToast("Exercises saved"); }, [currentUser]);
  const saveHabits    = useCallback(async (list) => { setHabits(list);    await saveSetting(currentUser,"habits",list);    showToast("Habits saved");   }, [currentUser]);

  async function saveUsers(list) { setUsers(list); await saveGlobalSetting("users",list); }
  async function switchUser(u)   { setCurrentUser(u); await saveGlobalSetting("current-user",u); }
  async function renameUser(oldName, newName) {
    if (!newName || users.includes(newName)) return;
    const newUsers = users.map(u=>u===oldName?newName:u);
    setUsers(newUsers);
    await saveGlobalSetting("users", newUsers);
    if (currentUser===oldName) { setCurrentUser(newName); await saveGlobalSetting("current-user",newName); }
  }
  async function saveData(newData) { setData(newData); await supabase.from("vitals_data").delete().eq("user_name",currentUser); }

  function getDayData(key) { return data[key]||{}; }

  function handleFoodSelect(dayKey,groupKey,optionId) {
    const dd=getDayData(dayKey); const food={...(dd.food||{})};
    food[groupKey]=food[groupKey]===optionId?null:optionId;
    const newDay={...dd,food}; saveDayData({...data,[dayKey]:newDay},dayKey,newDay);
  }
  function handleHabitToggle(dayKey,habitId) {
    const dd=getDayData(dayKey);
    const newDay={...dd,habits:{...(dd.habits||{}),[habitId]:!dd.habits?.[habitId]}};
    saveDayData({...data,[dayKey]:newDay},dayKey,newDay);
  }
  function handleExToggle(dayKey,ex) {
    const dd=getDayData(dayKey); const cur=dd.exercises||[];
    const newDay={...dd,exercises:cur.includes(ex)?cur.filter(e=>e!==ex):[...cur,ex]};
    saveDayData({...data,[dayKey]:newDay},dayKey,newDay);
  }
  function handleNoteChange(dayKey,val) {
    const dd=getDayData(dayKey); const newDay={...dd,notes:val};
    saveDayData({...data,[dayKey]:newDay},dayKey,newDay);
  }
  function handleMetricChange(dayKey,field,val) {
    const dd=getDayData(dayKey); const newDay={...dd,metrics:{...(dd.metrics||{}),[field]:val}};
    saveDayData({...data,[dayKey]:newDay},dayKey,newDay);
  }

  function dayPanelProps(dayKey) {
    return {
      dayData:        getDayData(dayKey), habits, exercises, theme,
      onFoodSelect:   (gk,oid)=>handleFoodSelect(dayKey,gk,oid),
      onHabitToggle:  (hid)=>handleHabitToggle(dayKey,hid),
      onExToggle:     (ex)=>handleExToggle(dayKey,ex),
      onNoteChange:   (v)=>handleNoteChange(dayKey,v),
      onMetricChange: (f,v)=>handleMetricChange(dayKey,f,v),
    };
  }

  const today=new Date();
  const todayLabel=`${DAYS[today.getDay()]} ${today.getDate()} ${MONTHS[today.getMonth()]}`;
  const tk=todayKey();
  const bg = isLight?"#f0f0f0":"#111";
  const headerBg = isLight?"#fff":"#111";
  const headerBorder = isLight?"#e0e0e0":"#222";

  return (
    <div style={{...S.root, background:bg, color:isLight?"#111":"#f0f0f0"}}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
      <Toast message={toast.message} visible={toast.visible}/>
      <header style={{...S.header, background:headerBg, borderBottom:`1px solid ${headerBorder}`}}>
        <div style={S.headerInner}>
          <span style={S.logo}>◉ Vitals</span>
          <UserPicker users={users} currentUser={currentUser} onSelect={switchUser} onRename={renameUser}/>
        </div>
        <div style={{...S.headerDate, color:isLight?"#999":"#555"}}>{todayLabel}</div>
      </header>
      <main style={S.main}>
        {loading ? (
          <div style={S.loading}>
            <div style={S.spinner}/>
            <p style={S.loadingText}>Loading {currentUser}'s data…</p>
          </div>
        ) : (
          <>
            {view==="today"    && <DayPanel dayKey={tk} title="Today" {...dayPanelProps(tk)} readOnly={false}/>}
            {view==="calendar" && <CalendarView data={data} habits={habits} calMonth={calMonth} setCalMonth={setCalMonth} selectedDay={selectedDay} setSelectedDay={setSelectedDay} dayPanelProps={dayPanelProps} theme={theme}/>}
            {view==="insights" && <InsightsView data={data} habits={habits} insightRange={insightRange} setInsightRange={setInsightRange} theme={theme}/>}
            {view==="settings" && <SettingsView habits={habits} exercises={exercises} users={users} currentUser={currentUser} saveHabits={saveHabits} saveExercises={saveExercises} saveData={saveData} saveUsers={saveUsers} theme={theme} setTheme={setTheme}/>}
          </>
        )}
      </main>
      <nav style={{...S.nav, background:headerBg, borderTop:`1px solid ${headerBorder}`}}>
        {[{id:"today",icon:"◎",label:"Today"},{id:"calendar",icon:"▦",label:"Calendar"},{id:"insights",icon:"↗",label:"Insights"},{id:"settings",icon:"⚙",label:"Settings"}].map(tab=>(
          <button key={tab.id} onClick={()=>setView(tab.id)}
            style={{...S.navTab,...(view===tab.id?{color:"#6EE7B7"}:{color:isLight?"#aaa":"#555"})}}>
            <span style={S.navIcon}>{tab.icon}</span>
            <span style={S.navLabel}>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

const S = {
  root:            { minHeight:"100vh", fontFamily:"'Inter',system-ui,sans-serif", display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto" },
  header:          { padding:"12px 20px 10px", position:"sticky", top:0, zIndex:10 },
  headerInner:     { display:"flex", justifyContent:"space-between", alignItems:"center" },
  logo:            { fontSize:18, fontWeight:700, letterSpacing:"-0.5px", color:"#6EE7B7" },
  headerDate:      { fontSize:12, marginTop:4 },
  main:            { flex:1, overflowY:"auto", paddingBottom:80 },
  panel:           { padding:"20px 20px 8px" },
  panelTitle:      { fontSize:22, fontWeight:700, margin:"0 0 20px", letterSpacing:"-0.5px" },
  section:         { marginBottom:28 },
  sectionHeader:   { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 },
  label:           { display:"block", fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:"#6EE7B7", marginBottom:10 },
  loading:         { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"60vh", gap:16 },
  spinner:         { width:32, height:32, border:"3px solid #222", borderTop:"3px solid #6EE7B7", borderRadius:"50%", animation:"spin 0.8s linear infinite" },
  loadingText:     { color:"#555", fontSize:14 },
  toast:           { position:"fixed", top:70, left:"50%", transform:"translateX(-50%)", background:"#6EE7B7", color:"#111", padding:"8px 20px", borderRadius:20, fontSize:13, fontWeight:700, zIndex:200, animation:"fadeIn 0.2s ease", whiteSpace:"nowrap" },
  toastIcon:       { marginRight:4 },
  summaryStrip:    { display:"flex", borderRadius:12, border:"1px solid", padding:"12px 8px", marginBottom:24, gap:4 },
  summaryItem:     { flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 },
  summaryVal:      { fontSize:18, fontWeight:800 },
  summaryLab:      { fontSize:9, color:"#666", textTransform:"uppercase", letterSpacing:"0.05em" },
  summaryDivider:  { width:1, background:"#333", margin:"0 4px" },
  readOnlySummary: { display:"flex", flexDirection:"column", gap:16 },
  readOnlyChip:    { border:"1px solid", borderRadius:12, padding:"10px 14px", fontSize:14, fontWeight:500, display:"inline-flex", alignItems:"center", gap:8 },
  readOnlySection: { display:"flex", flexDirection:"column", gap:8 },
  pickerWrap:      { position:"relative" },
  pickerBtn:       { display:"flex", alignItems:"center", gap:6, background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:20, padding:"5px 10px 5px 5px", cursor:"pointer", color:"#f0f0f0" },
  pickerAvatar:    { width:26, height:26, borderRadius:"50%", background:"#6EE7B7", color:"#111", fontWeight:700, fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:"26px", textAlign:"center" },
  pickerName:      { fontSize:13, fontWeight:600 },
  pickerDropdown:  { position:"absolute", top:"calc(100% + 6px)", right:0, background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:12, overflow:"hidden", minWidth:180, zIndex:100, boxShadow:"0 8px 24px rgba(0,0,0,0.4)" },
  pickerOption:    { display:"flex", alignItems:"center", gap:8, width:"100%", padding:"10px 14px", background:"none", border:"none", color:"#aaa", fontSize:14, cursor:"pointer", textAlign:"left" },
  pickerOptionActive:{ color:"#f0f0f0", background:"#222" },
  choiceGrid:      { display:"flex", flexDirection:"column", gap:8 },
  choiceBtn:       { display:"flex", alignItems:"center", gap:12, border:"1px solid", borderRadius:12, padding:"12px 16px", cursor:"pointer", textAlign:"left", transition:"all 0.15s" },
  choiceEmoji:     { fontSize:20, width:28, textAlign:"center" },
  choiceLabel:     { fontSize:14, fontWeight:500 },
  habitGrid:       { display:"flex", flexDirection:"column", gap:8 },
  habitBtn:        { display:"flex", alignItems:"center", gap:10, background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, padding:"12px 16px", color:"#aaa", fontSize:14, cursor:"pointer", textAlign:"left", transition:"all 0.15s" },
  habitBtnOn:      { background:"#1a2e25", border:"1px solid #6EE7B7", color:"#f0f0f0" },
  habitCheck:      { fontSize:16, width:20, textAlign:"center" },
  exGrid:          { display:"flex", flexWrap:"wrap", gap:8 },
  exBtn:           { background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:20, padding:"8px 14px", color:"#aaa", fontSize:13, cursor:"pointer", transition:"all 0.15s" },
  exBtnOn:         { background:"#1a2333", border:"1px solid #93C5FD", color:"#93C5FD", borderRadius:20, padding:"8px 14px", fontSize:13 },
  textarea:        { width:"100%", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, padding:"12px 14px", color:"#f0f0f0", fontSize:14, minHeight:80, resize:"vertical", outline:"none", boxSizing:"border-box", fontFamily:"inherit" },
  nav:             { position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, display:"flex", zIndex:20 },
  navTab:          { flex:1, display:"flex", flexDirection:"column", alignItems:"center", padding:"10px 0 14px", background:"none", border:"none", cursor:"pointer", gap:2 },
  navIcon:         { fontSize:18 },
  navLabel:        { fontSize:10, fontWeight:500, letterSpacing:"0.05em" },
  calHeader:       { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 },
  navBtn:          { background:"none", border:"none", color:"#6EE7B7", fontSize:24, cursor:"pointer", padding:"0 8px" },
  calGrid:         { display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 },
  calDayLabel:     { textAlign:"center", fontSize:10, fontWeight:600, color:"#555", padding:"4px 0" },
  calCell:         { background:"#1a1a1a", border:"1px solid #222", borderRadius:8, padding:"6px 4px", minHeight:52, display:"flex", flexDirection:"column", alignItems:"center", cursor:"pointer" },
  calCellToday:    { border:"1px solid #6EE7B7" },
  calDate:         { fontSize:12, fontWeight:600 },
  calDots:         { display:"flex", gap:2, marginTop:4, flexWrap:"wrap", justifyContent:"center" },
  dot:             { width:6, height:6, borderRadius:"50%" },
  modal:           { position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:50, display:"flex", alignItems:"flex-end" },
  modalBox:        { background:"#111", width:"100%", maxWidth:480, margin:"0 auto", borderRadius:"20px 20px 0 0", maxHeight:"90vh", overflowY:"auto", position:"relative", paddingTop:8 },
  closeBtn:        { background:"none", border:"none", color:"#666", fontSize:20, cursor:"pointer" },
  modalHeader:     { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px 0", position:"sticky", top:0, zIndex:5 },
  editDayBtn:      { border:"1px solid", borderRadius:20, padding:"6px 14px", background:"none", fontSize:13, fontWeight:600, cursor:"pointer" },
  insightHeader:   { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 },
  rangeToggle:     { display:"flex", gap:6 },
  rangeBtn:        { background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:8, padding:"4px 10px", color:"#666", fontSize:12, cursor:"pointer" },
  rangeBtnOn:      { border:"1px solid #6EE7B7", color:"#6EE7B7" },
  weekGrid:        { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 },
  weekCard:        { background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:12, padding:"12px", display:"flex", flexDirection:"column", gap:2 },
  weekVal:         { fontSize:24, fontWeight:800, color:"#6EE7B7" },
  weekLab:         { fontSize:11, color:"#888" },
  pieBarWrap:      { display:"flex", flexDirection:"column", gap:10 },
  pieBarRow:       { display:"flex", alignItems:"center", gap:8 },
  pieBarEmoji:     { fontSize:16, width:24, textAlign:"center" },
  pieBarTrack:     { flex:1, background:"#1a1a1a", borderRadius:20, height:10, overflow:"hidden" },
  pieBarFill:      { height:"100%", borderRadius:20, transition:"width 0.4s" },
  pieBarCount:     { fontSize:12, fontWeight:700, width:28, textAlign:"right" },
  pieBarPct:       { fontSize:11, color:"#555", width:30, textAlign:"right" },
  streakGrid:      { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 },
  streakCard:      { background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:12, padding:"16px 14px", textAlign:"center" },
  streakNum:       { fontSize:36, fontWeight:800, color:"#6EE7B7", lineHeight:1 },
  streakLabel:     { fontSize:12, fontWeight:600, marginTop:6, color:"#f0f0f0" },
  streakSub:       { fontSize:11, color:"#555", marginTop:2 },
  streakRate:      { fontSize:11, color:"#6EE7B7", marginTop:6 },
  exStat:          { display:"flex", alignItems:"baseline", gap:4, marginBottom:10 },
  exBigNum:        { fontSize:40, fontWeight:800, color:"#93C5FD", lineHeight:1 },
  exOf:            { fontSize:14, color:"#666" },
  progressBar:     { background:"#1a1a1a", borderRadius:20, height:8, overflow:"hidden" },
  progressFill:    { background:"#93C5FD", height:"100%", borderRadius:20, transition:"width 0.4s" },
  empty:           { color:"#555", fontSize:13 },
  tagList:         { display:"flex", flexWrap:"wrap", gap:8, marginBottom:12 },
  tag:             { background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:20, padding:"6px 12px", fontSize:13, display:"flex", alignItems:"center", gap:6 },
  tagActive:       { border:"1px solid #6EE7B7", color:"#6EE7B7" },
  removeBtn:       { background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:12, padding:0 },
  addRow:          { display:"flex", gap:8 },
  addInput:        { flex:1, background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:10, padding:"10px 14px", color:"#f0f0f0", fontSize:14, outline:"none", fontFamily:"inherit" },
  addBtn:          { background:"#6EE7B7", color:"#111", border:"none", borderRadius:10, padding:"10px 16px", fontWeight:700, cursor:"pointer", fontSize:14 },
  editBtn:         { background:"none", border:"1px solid #2a2a2a", borderRadius:8, padding:"4px 12px", color:"#aaa", fontSize:12, cursor:"pointer" },
  dangerBtn:       { background:"none", border:"1px solid #ef4444", borderRadius:10, padding:"10px 16px", color:"#ef4444", fontSize:14, cursor:"pointer" },
  resetBtn:        { background:"none", border:"1px solid #6EE7B7", borderRadius:10, padding:"10px 16px", color:"#6EE7B7", fontSize:14, cursor:"pointer" },
  themeBtn:        { flex:1, border:"1px solid", borderRadius:10, padding:"10px 16px", fontSize:14, cursor:"pointer", fontWeight:600 },
  metricsGrid:     { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 },
  metricField:     { background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:12, padding:"12px 10px", display:"flex", flexDirection:"column", alignItems:"center", gap:4 },
  metricIcon:      { fontSize:20 },
  metricInputWrap: { display:"flex", alignItems:"center", gap:2 },
  metricInput:     { background:"none", border:"none", color:"#f0f0f0", fontSize:16, fontWeight:700, width:"60px", textAlign:"center", outline:"none", fontFamily:"inherit" },
  metricUnit:      { fontSize:11, color:"#555" },
  metricLabel:     { fontSize:11, fontWeight:600, color:"#aaa", textAlign:"center" },
  metricHint:      { fontSize:9, color:"#444", textAlign:"center" },
  metricRow:       { display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" },
  metricRowDate:   { fontSize:12, color:"#555", minWidth:42 },
  metricPill:      { background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:20, padding:"4px 10px", fontSize:12, color:"#f0f0f0" },
};
