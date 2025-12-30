import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Info, CheckCircle, Wrench, Cpu, GitBranch } from 'lucide-react';

// ============================================================================
// CONSTANTS - Based on Mazak Programming Manual
// ============================================================================

const G_CODES = {
  TURRET_UPPER: 'G109 L1',
  TURRET_LOWER: 'G109 L2',
};

const M_CODES = {
  BALANCE_START: 'M562',
  BALANCE_END: 'M563',
  SPINDLE_1: 'M901',
  SPINDLE_2: 'M902',
  WAIT_START: 950,
  WAIT_END: 997,
  MILLING_MODE_1: 'M200',
  MILLING_MODE_2: 'M300',
  MILLING_NORMAL_1: 'M203',
  MILLING_NORMAL_2: 'M303',
  MILLING_REVERSE_1: 'M204',
  MILLING_REVERSE_2: 'M304',
  MILLING_STOP_1: 'M205',
  MILLING_STOP_2: 'M305',
  CROSS_MACHINING: 'G110',
  CROSS_CANCEL: 'G111',
};

const VALID_G_CODES = [
  'G00', 'G01', 'G01.1', 'G02', 'G03', 'G02.1', 'G03.1',
  'G04', 'G05', 'G06.1', 'G06.2', 'G07', 'G07.1', 'G09',
  'G10', 'G10.1', 'G10.9', 'G11', 'G12.1', 'G13.1',
  'G17', 'G18', 'G19', 'G20', 'G21', 'G22', 'G23',
  'G27', 'G28', 'G29', 'G30', 'G31', 'G31.1', 'G31.2', 'G31.3',
  'G32', 'G33', 'G34', 'G34.1', 'G35', 'G36', 'G37', 'G37.1',
  'G40', 'G41', 'G42', 'G43', 'G44', 'G49', 'G50', 'G52',
  'G53', 'G53.5', 'G54', 'G54.1', 'G54.2', 'G55', 'G56', 'G57', 'G58', 'G59',
  'G60', 'G61', 'G61.1', 'G62', 'G63', 'G64', 'G65', 'G66', 'G66.1', 'G67',
  'G68', 'G68.2', 'G68.5', 'G69', 'G69.5',
  'G70', 'G71', 'G71.1', 'G72', 'G72.1', 'G73', 'G74', 'G75', 'G76', 'G77', 'G78', 'G79',
  'G80', 'G81', 'G82', 'G83', 'G84', 'G84.2', 'G84.3', 'G85', 'G86', 'G87', 'G88', 'G88.2', 'G89',
  'G90', 'G91', 'G92', 'G92.5', 'G93', 'G94', 'G95', 'G96', 'G97', 'G98', 'G99',
  'G109', 'G110', 'G111', 'G112', 'G113', 'G114.3',
  'G122', 'G122.1', 'G123', 'G123.1', 'G130', 'G136', 'G137',
  'G234.1', 'G235', 'G236', 'G237.1',
  'G270', 'G271', 'G272', 'G273', 'G274', 'G275', 'G276',
  'G283', 'G284', 'G284.2', 'G285', 'G287', 'G288', 'G288.2', 'G289',
  'G290', 'G292', 'G294'
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const detectTurretSelection = (line) => {
  if (line.includes('G109 L1')) return 'upper';
  if (line.includes('G109 L2')) return 'lower';
  return null;
};

const detectSpindleSelection = (line) => {
  if (line.includes('M901')) return 'HD1';
  if (line.includes('M902')) return 'HD2';
  return null;
};

const detectMillingMode = (line) => {
  return line.includes('M200') || line.includes('M300') || 
         line.includes('M203') || line.includes('M303');
};

const detectWaitingCode = (line) => {
  // Check for M-codes (M950-M997)
  const mMatch = line.match(/\bM(95[0-9]|96[0-9]|97[0-9]|99[0-7])\b/);
  if (mMatch) return { type: 'M', code: mMatch[0] };
  
  // Check for P-codes (P1-P99999999)
  const pMatch = line.match(/\bP(\d{1,8})\b/);
  if (pMatch && parseInt(pMatch[1]) >= 1 && parseInt(pMatch[1]) <= 99999999) {
    return { type: 'P', code: pMatch[0], value: parseInt(pMatch[1]) };
  }
  
  return null;
};

const extractGCodes = (line) => {
  const gCodes = [];
  const matches = line.matchAll(/\bG(\d{1,3}\.?\d*)\b/g);
  for (const match of matches) {
    gCodes.push('G' + match[1]);
  }
  return gCodes;
};

const validateGCode = (gCode) => {
  return VALID_G_CODES.includes(gCode);
};

const extractFeedRate = (line) => {
  const match = line.match(/\bF([\d.]+)\b/);
  return match ? parseFloat(match[1]) : null;
};

const extractSpindleSpeed = (line) => {
  const match = line.match(/\bS(\d+)\b/);
  return match ? parseInt(match[1]) : null;
};

const isComment = (line) => {
  return line.trim().startsWith('(');
};

const isCommonSectionEnd = (line) => {
  return line.includes('G109');
};

// Syntax highlighting with color coding
const highlightSyntax = (line) => {
  if (isComment(line)) {
    return <span className="text-emerald-600 italic">{line}</span>;
  }

  const parts = [];
  let remaining = line;
  let key = 0;

  // Pattern to match addresses with values
  const pattern = /([NGOXYZIЈKFSTMPQRLHDCABUW])([+-]?\d*\.?\d+)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(line)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++} className="text-slate-700">
          {line.substring(lastIndex, match.index)}
        </span>
      );
    }

    const address = match[1];
    const value = match[2];

    // Color based on address type
    let color = 'text-slate-700';
    if (address === 'G') color = 'text-blue-600 font-semibold';
    else if (address === 'M') color = 'text-orange-600 font-semibold';
    else if (['X', 'Y', 'Z', 'U', 'V', 'W'].includes(address)) color = 'text-green-600';
    else if (['I', 'J', 'K'].includes(address)) color = 'text-teal-600';
    else if (address === 'F') color = 'text-purple-600';
    else if (address === 'S') color = 'text-pink-600';
    else if (address === 'T') color = 'text-amber-600';
    else if (address === 'N') color = 'text-slate-400';
    else if (['P', 'Q', 'R', 'L', 'H', 'D'].includes(address)) color = 'text-cyan-600';

    parts.push(
      <span key={key++} className={color}>
        {address}{value}
      </span>
    );

    lastIndex = pattern.lastIndex;
  }

  // Add remaining text
  if (lastIndex < line.length) {
    parts.push(
      <span key={key++} className="text-slate-700">
        {line.substring(lastIndex)}
      </span>
    );
  }

  return <>{parts}</>;
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const MazakEnhancedEditor = () => {
  const [fullCode, setFullCode] = useState(`O0001 (MAZAK-INTEGREX-SAMPLE)
(PART NAME: Balance Cutting Demonstration)
(MATERIAL: 4140 Steel)
(PROGRAMMER: Engineer)
(DATE: 2024-12-30)

N0001 G28 U0 W0;
N0002 G40 G80 G97 G98;
N0003 G50 S3500;
N0004 G21;

(========================================)
(TOOL 1 - ROUGH OD UPPER TURRET        )
(========================================)
N1000 G109 L1;
N1001 T0101 M06 D001;
N1002 M901;
N1003 G97 S1200 M03;
N1004 G00 X65. Z5. M08;
N1010 G01 X50. Z-50. F0.3;
N1011 G00 X65. Z5.;
N1012 M09 M05;

(========================================)
(BALANCE CUTTING OPERATION              )
(========================================)
N2000 G109 L1;
N2001 M901;
N2002 G00 X80. Z5.;
N2003 P10;
N2004 M03 S800;
N2005 T0202 M06 D002;
N2006 X55. Z2. M08;
N2007 M950;
N2008 M562;
N2009 G01 X50. F0.25;
N2010 G00 X80. Z5.;
N2011 M563;
N2012 P20;
N2013 M09 M05;

N3000 G109 L2;
N3001 M901;
N3002 G00 X80. Z5.;
N3003 P10;
N3004 M950;
N3005 M03 S800;
N3006 T0301;
N3007 X45. Z2. M08;
N3008 P20;
N3009 G01 X40. F0.25;
N3010 G00 X80. Z5.;

N9998 M09;
N9999 M05;
N10000 G28 U0 W0;
N10001 M30;`);

  const [upperTurret, setUpperTurret] = useState([]);
  const [lowerTurret, setLowerTurret] = useState([]);
  const [commonSection, setCommonSection] = useState([]);
  const [analysis, setAnalysis] = useState({ 
    warnings: [], 
    info: [], 
    errors: [] 
  });
  const [machineState, setMachineState] = useState({
    upper: { spindle: null, milling: false, crossMachining: false },
    lower: { spindle: null, milling: false, crossMachining: false }
  });

  useEffect(() => {
    parseGCode(fullCode);
  }, [fullCode]);

  const parseGCode = (code) => {
    const lines = code.split('\n');
    const upper = [];
    const lower = [];
    const common = [];
    let currentTurret = null;
    let inBalanceCutting = false;
    let balanceMaster = null;
    const warnings = [];
    const info = [];
    const errors = [];
    
    // State tracking
    let firstG109Found = false;
    const waitCodes = { upper: [], lower: [] };
    const spindleState = { upper: null, lower: null };
    const millingState = { upper: false, lower: false };
    const crossMachining = { upper: false, lower: false };
    
    // Balance cutting tracking
    let masterWaitBeforeBalance = null;
    let slaveWaitBeforeBalance = null;

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      const lineNum = idx + 1;
      
      // Skip empty lines and section dividers
      if (!trimmed || trimmed.startsWith('(=')) return;
      
      // Common section detection
      if (!firstG109Found && !trimmed.includes('G109')) {
        if (trimmed && !trimmed.startsWith('O')) {
          common.push({ 
            line: trimmed, 
            lineNum,
            type: 'common',
            isComment: isComment(trimmed)
          });
        }
        return;
      }
      
      // Turret selection
      const turretSelect = detectTurretSelection(trimmed);
      if (turretSelect) {
        firstG109Found = true;
        currentTurret = turretSelect;
        
        // Validate G109 block
        const gCodes = extractGCodes(trimmed);
        const otherGCodes = gCodes.filter(g => g !== 'G109');
        if (otherGCodes.length > 0 && otherGCodes.some(g => g.match(/^G0[0-3]$/))) {
          warnings.push(`Line ${lineNum}: G109 should not be combined with G00-G03 in same block`);
        }
        
        const target = turretSelect === 'upper' ? upper : lower;
        target.push({ 
          line: trimmed, 
          lineNum,
          type: 'turret-select',
          isComment: false
        });
        
        info.push(`Line ${lineNum}: ${turretSelect === 'upper' ? 'Upper' : 'Lower'} turret selected (${turretSelect === 'upper' ? 'G109 L1' : 'G109 L2'})`);
        return;
      }
      
      if (!currentTurret) return;
      
      // Spindle selection
      const spindle = detectSpindleSelection(trimmed);
      if (spindle) {
        spindleState[currentTurret] = spindle;
        info.push(`Line ${lineNum}: ${spindle === 'HD1' ? '1st' : '2nd'} spindle selected (${spindle === 'HD1' ? 'M901' : 'M902'})`);
      }
      
      // Milling mode detection
      if (detectMillingMode(trimmed)) {
        millingState[currentTurret] = true;
        info.push(`Line ${lineNum}: Milling mode activated`);
      }
      if (trimmed.includes('M205') || trimmed.includes('M305')) {
        millingState[currentTurret] = false;
      }
      
      // Cross machining control
      if (trimmed.includes('G110')) {
        crossMachining[currentTurret] = true;
        info.push(`Line ${lineNum}: Cross machining control active`);
      }
      if (trimmed.includes('G111')) {
        crossMachining[currentTurret] = false;
        info.push(`Line ${lineNum}: Cross machining control cancelled`);
      }
      
      // Wait code detection
      const waitCode = detectWaitingCode(trimmed);
      if (waitCode) {
        waitCodes[currentTurret].push({ 
          code: waitCode.code, 
          value: waitCode.value, 
          lineNum 
        });
      }
      
      // Balance cutting start
      if (trimmed.includes('M562')) {
        inBalanceCutting = true;
        balanceMaster = currentTurret;
        
        // Check for wait code before M562
        const lastWaitCode = waitCodes[currentTurret][waitCodes[currentTurret].length - 1];
        if (!lastWaitCode) {
          warnings.push(`Line ${lineNum}: Wait code (M950-M997 or P1-P99999999) should precede M562`);
        } else {
          masterWaitBeforeBalance = lastWaitCode;
          
          // Check if opposite turret has matching wait code
          const oppTurret = currentTurret === 'upper' ? 'lower' : 'upper';
          const oppLastWait = waitCodes[oppTurret][waitCodes[oppTurret].length - 1];
          
          if (!oppLastWait) {
            warnings.push(`Line ${lineNum}: ${oppTurret === 'upper' ? 'Upper' : 'Lower'} turret needs wait code before balance cutting`);
          } else if (lastWaitCode.code !== oppLastWait.code) {
            warnings.push(`Line ${lineNum}: Mismatched wait codes - Master: ${lastWaitCode.code}, Slave: ${oppLastWait.code}`);
          }
        }
        
        info.push(`Line ${lineNum}: Balance cutting starts (Master: ${currentTurret})`);
      }
      
      // Balance cutting end
      if (trimmed.includes('M563')) {
        inBalanceCutting = false;
        
        // Check for wait code after M563
        const nextLines = lines.slice(idx, Math.min(lines.length, idx + 5));
        const hasWaitCodeAfter = nextLines.some(l => detectWaitingCode(l.trim()) !== null);
        
        if (!hasWaitCodeAfter) {
          warnings.push(`Line ${lineNum}: Wait code required after M563 to release slave turret`);
        }
        
        info.push(`Line ${lineNum}: Balance cutting ends`);
      }
      
      // G-code validation
      const gCodes = extractGCodes(trimmed);
      gCodes.forEach(gCode => {
        if (!validateGCode(gCode)) {
          errors.push(`Line ${lineNum}: Invalid or unsupported G-code: ${gCode}`);
        }
      });
      
      // Feed rate validation
      const feedRate = extractFeedRate(trimmed);
      if (feedRate !== null) {
        if (feedRate === 0) {
          errors.push(`Line ${lineNum}: Feed rate F0 will cause alarm 816 (FEEDRATE ZERO)`);
        } else if (feedRate < 0.0001) {
          warnings.push(`Line ${lineNum}: Feed rate F${feedRate} is unusually low`);
        }
      }
      
      // Spindle speed validation
      const spindleSpeed = extractSpindleSpeed(trimmed);
      if (spindleSpeed !== null && trimmed.includes('S')) {
        if (spindleSpeed > 5000) {
          warnings.push(`Line ${lineNum}: Spindle speed S${spindleSpeed} RPM is unusually high`);
        }
        if (inBalanceCutting) {
          info.push(`Line ${lineNum}: Spindle speed ${spindleSpeed} RPM in balance cutting`);
        }
      }
      
      // Block length validation (128 characters max per manual)
      if (trimmed.length > 128) {
        errors.push(`Line ${lineNum}: Block exceeds 128 character limit (${trimmed.length} chars)`);
      }
      
      // Add to appropriate turret
      const target = currentTurret === 'upper' ? upper : lower;
      target.push({ 
        line: trimmed, 
        lineNum,
        type: inBalanceCutting ? 'balance' : 'normal',
        isComment: isComment(trimmed),
        spindle: spindleState[currentTurret],
        milling: millingState[currentTurret],
        crossMachining: crossMachining[currentTurret]
      });
    });

    setUpperTurret(upper);
    setLowerTurret(lower);
    setCommonSection(common);
    setAnalysis({ warnings, info, errors });
    setMachineState({
      upper: { 
        spindle: spindleState.upper, 
        milling: millingState.upper,
        crossMachining: crossMachining.upper
      },
      lower: { 
        spindle: spindleState.lower, 
        milling: millingState.lower,
        crossMachining: crossMachining.lower
      }
    });
  };

  const getLineStyle = (item) => {
    if (item.isComment) return 'bg-slate-50';
    if (item.type === 'turret-select') return 'bg-blue-50 border-l-4 border-blue-500 font-semibold';
    if (item.type === 'balance') return 'bg-amber-50 border-l-4 border-amber-500';
    if (item.type === 'common') return 'bg-indigo-50';
    return '';
  };

  const stats = useMemo(() => ({
    totalLines: fullCode.split('\n').length,
    upperLines: upperTurret.filter(i => !i.isComment).length,
    lowerLines: lowerTurret.filter(i => !i.isComment).length,
    commonLines: commonSection.filter(i => !i.isComment).length,
    errors: analysis.errors.length,
    warnings: analysis.warnings.length,
  }), [fullCode, upperTurret, lowerTurret, commonSection, analysis]);

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col font-mono">
      {/* Header with industrial design */}
      <div className="bg-gradient-to-r from-slate-950 to-slate-900 text-white p-4 border-b-2 border-orange-500 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Cpu className="w-8 h-8 text-orange-500" />
              <div>
                <h1 className="text-2xl font-bold tracking-wider" style={{ fontFamily: 'Courier New, monospace' }}>
                  MAZAK INTEGREX 100-IV ST
                </h1>
                <p className="text-xs text-slate-400 tracking-wide">MATRIX CONTROL • DUAL TURRET SYSTEM</p>
              </div>
            </div>
          </div>
          
          {/* Stats Panel */}
          <div className="flex gap-6 text-xs">
            <div className="text-center">
              <div className="text-slate-400">TOTAL</div>
              <div className="text-xl font-bold text-orange-400">{stats.totalLines}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400">ERRORS</div>
              <div className="text-xl font-bold text-red-400">{stats.errors}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-400">WARNINGS</div>
              <div className="text-xl font-bold text-amber-400">{stats.warnings}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Panel */}
      {(analysis.errors.length > 0 || analysis.warnings.length > 0 || analysis.info.length > 0) && (
        <div className="bg-slate-800 border-b border-slate-700 p-3 max-h-48 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Errors */}
            {analysis.errors.length > 0 && (
              <div className="bg-red-950 border border-red-800 rounded p-2">
                <div className="flex items-center gap-2 text-red-400 font-bold mb-2">
                  <AlertCircle size={16} />
                  <span>ERRORS ({analysis.errors.length})</span>
                </div>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {analysis.errors.map((e, i) => (
                    <div key={i} className="text-red-300 pl-5">{e}</div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Warnings */}
            {analysis.warnings.length > 0 && (
              <div className="bg-amber-950 border border-amber-800 rounded p-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold mb-2">
                  <AlertCircle size={16} />
                  <span>WARNINGS ({analysis.warnings.length})</span>
                </div>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {analysis.warnings.map((w, i) => (
                    <div key={i} className="text-amber-300 pl-5">{w}</div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Info */}
            {analysis.info.length > 0 && (
              <div className="bg-blue-950 border border-blue-800 rounded p-2">
                <div className="flex items-center gap-2 text-blue-400 font-bold mb-2">
                  <Info size={16} />
                  <span>INFO ({analysis.info.length})</span>
                </div>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {analysis.info.slice(0, 5).map((i, idx) => (
                    <div key={idx} className="text-blue-300 pl-5">{i}</div>
                  ))}
                  {analysis.info.length > 5 && (
                    <div className="text-blue-400 pl-5 italic">...and {analysis.info.length - 5} more</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="flex-1 grid grid-cols-4 gap-0 overflow-hidden bg-slate-900">
        {/* Full Program Editor */}
        <div className="col-span-1 flex flex-col bg-slate-950 border-r-2 border-slate-700">
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white px-3 py-2 font-bold text-sm border-b border-slate-600 flex items-center justify-between">
            <span className="tracking-wide">FULL PROGRAM</span>
            <span className="text-xs bg-slate-900 px-2 py-1 rounded">{stats.totalLines} LINES</span>
          </div>
          <textarea
            value={fullCode}
            onChange={(e) => setFullCode(e.target.value)}
            className="flex-1 p-3 bg-slate-950 text-slate-200 font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-orange-500"
            spellCheck={false}
            style={{ fontFamily: 'Consolas, Monaco, monospace' }}
          />
        </div>

        {/* Common Section */}
        {commonSection.length > 0 && (
          <div className="flex flex-col bg-slate-900 border-r border-slate-700">
            <div className="bg-gradient-to-r from-indigo-700 to-indigo-600 text-white px-3 py-2 font-bold text-sm border-b border-indigo-500 flex items-center justify-between">
              <span className="tracking-wide">COMMON SECTION</span>
              <span className="text-xs bg-indigo-900 px-2 py-1 rounded">{stats.commonLines} LINES</span>
            </div>
            <div className="flex-1 overflow-auto p-3 bg-indigo-950/20">
              {commonSection.map((item, idx) => (
                <div key={idx} className={`mb-1 px-2 py-1 rounded ${getLineStyle(item)} text-xs`}>
                  <span className="text-slate-500 mr-3 select-none inline-block w-12">
                    N{item.lineNum.toString().padStart(4, '0')}
                  </span>
                  {highlightSyntax(item.line)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upper Turret (G109 L1) */}
        <div className={`${commonSection.length > 0 ? 'col-span-1' : 'col-span-1.5'} flex flex-col bg-slate-900 border-r border-slate-700`}>
          <div className="bg-gradient-to-r from-green-700 to-green-600 text-white px-3 py-2 font-bold text-sm border-b border-green-500 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench size={16} />
              <span className="tracking-wide">UPPER TURRET (G109 L1)</span>
            </div>
            <div className="flex items-center gap-2">
              {machineState.upper.spindle && (
                <span className="text-xs bg-green-900 px-2 py-1 rounded">
                  {machineState.upper.spindle}
                </span>
              )}
              {machineState.upper.milling && (
                <span className="text-xs bg-blue-900 px-2 py-1 rounded">MILL</span>
              )}
              {machineState.upper.crossMachining && (
                <GitBranch size={14} className="text-yellow-400" />
              )}
              <span className="text-xs bg-green-900 px-2 py-1 rounded">{stats.upperLines} LINES</span>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-3 bg-green-950/10">
            {upperTurret.length === 0 ? (
              <div className="text-slate-500 italic text-xs">No upper turret operations</div>
            ) : (
              upperTurret.map((item, idx) => (
                <div key={idx} className={`mb-1 px-2 py-1 rounded ${getLineStyle(item)} text-xs`}>
                  <span className="text-slate-500 mr-3 select-none inline-block w-12">
                    N{item.lineNum.toString().padStart(4, '0')}
                  </span>
                  {highlightSyntax(item.line)}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Lower Turret (G109 L2) */}
        <div className={`${commonSection.length > 0 ? 'col-span-1' : 'col-span-1.5'} flex flex-col bg-slate-900`}>
          <div className="bg-gradient-to-r from-purple-700 to-purple-600 text-white px-3 py-2 font-bold text-sm border-b border-purple-500 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench size={16} />
              <span className="tracking-wide">LOWER TURRET (G109 L2)</span>
            </div>
            <div className="flex items-center gap-2">
              {machineState.lower.spindle && (
                <span className="text-xs bg-purple-900 px-2 py-1 rounded">
                  {machineState.lower.spindle}
                </span>
              )}
              {machineState.lower.milling && (
                <span className="text-xs bg-blue-900 px-2 py-1 rounded">MILL</span>
              )}
              {machineState.lower.crossMachining && (
                <GitBranch size={14} className="text-yellow-400" />
              )}
              <span className="text-xs bg-purple-900 px-2 py-1 rounded">{stats.lowerLines} LINES</span>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-3 bg-purple-950/10">
            {lowerTurret.length === 0 ? (
              <div className="text-slate-500 italic text-xs">No lower turret operations</div>
            ) : (
              lowerTurret.map((item, idx) => (
                <div key={idx} className={`mb-1 px-2 py-1 rounded ${getLineStyle(item)} text-xs`}>
                  <span className="text-slate-500 mr-3 select-none inline-block w-12">
                    N{item.lineNum.toString().padStart(4, '0')}
                  </span>
                  {highlightSyntax(item.line)}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Legend/Footer */}
      <div className="bg-slate-950 border-t-2 border-orange-500 p-2 flex flex-wrap gap-4 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-amber-50 border border-amber-500"></div>
          <span>Balance Cutting</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-50 border border-blue-500"></div>
          <span>Turret Selection</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-indigo-50 border border-indigo-500"></div>
          <span>Common Section</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-slate-50 border border-slate-400"></div>
          <span>Comments</span>
        </div>
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-yellow-400" />
          <span>Cross Machining</span>
        </div>
        <div className="ml-auto text-slate-500">
          MAZAK MATRIX CONTROL • Enhanced G-Code Editor v2.0
        </div>
      </div>
    </div>
  );
};

export default MazakEnhancedEditor;
