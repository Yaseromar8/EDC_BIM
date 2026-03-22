import React, { useState, useMemo, useEffect } from 'react';
import './ScheduleDetailedView.css';

const ScheduleDetailedView = ({ scheduleData, initialTab = 'Activities' }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRows, setExpandedRows] = useState(new Set());
    const [viewScale, setViewScale] = useState('Month'); // Day, Week, Month
    const [activeTab, setActiveTab] = useState(initialTab);
    
    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);
    const tableRef = React.useRef(null);
    const ganttRef = React.useRef(null);

    const handleScroll = (e) => {
        if (e.target === tableRef.current) {
            ganttRef.current.scrollTop = e.target.scrollTop;
        } else if (e.target === ganttRef.current) {
            tableRef.current.scrollTop = e.target.scrollTop;
        }
    };
    const displayRows = useMemo(() => {
        if (!scheduleData) return [];
        
        const { tasks = [], wbs = [] } = scheduleData || {};
        
        // Map WBS to children
        const wbsById = {};
        wbs.forEach(w => {
            if (w && w.id) {
                wbsById[w.id] = { ...w, activities: [], childrenWBS: [], isExpanded: expandedRows.has(w.id), start: null, end: null };
            }
        });
        
        wbs.forEach(w => {
            if (w && w.parentId && wbsById[w.parentId]) {
                wbsById[w.parentId].childrenWBS.push(wbsById[w.id]);
            }
        });
        
        tasks.forEach(t => {
            if (t && t.wbsId && wbsById[t.wbsId]) {
                wbsById[t.wbsId].activities.push(t);
            }
        });

        // RECURSIVE DATE CALCULATION FOR WBS
        const calculateWBSDates = (node) => {
            let minS = null;
            let maxE = null;

            node.activities.forEach(act => {
                if (act.start) {
                    const s = new Date(act.start);
                    if (!minS || s < minS) minS = s;
                }
                if (act.end) {
                    const e = new Date(act.end);
                    if (!maxE || e > maxE) maxE = e;
                }
            });

            node.childrenWBS.forEach(child => {
                const { min, max } = calculateWBSDates(child);
                if (min && (!minS || min < minS)) minS = min;
                if (max && (!maxE || max > maxE)) maxE = max;
            });

            node.start = minS ? minS.toISOString().split('T')[0] : null;
            node.end = maxE ? maxE.toISOString().split('T')[0] : null;
            return { min: minS, max: maxE };
        };

        const roots = wbs.filter(w => w && (!w.parentId || !wbsById[w.parentId])).map(w => wbsById[w.id]);
        roots.forEach(calculateWBSDates);

        const rows = [];
        const flatten = (nodes, level = 0) => {
            nodes.forEach(node => {
                rows.push({ ...node, level, isWBS: true });
                if (expandedRows.has(node.id)) {
                    flatten(node.childrenWBS, level + 1);
                    node.activities.forEach(act => {
                        rows.push({ ...act, level: level + 1, isWBS: false });
                    });
                }
            });
        };

        flatten(roots);
        
        if (searchTerm) {
            return rows.filter(r => 
                r.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                r.activityId?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        return rows;
    }, [scheduleData, expandedRows, searchTerm]);

    const toggleRow = (id) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) newExpanded.delete(id);
        else newExpanded.add(id);
        setExpandedRows(newExpanded);
    };

    // Gantt Logic: Calculate dates
    const { minDate, maxDate, totalDays } = useMemo(() => {
        if (!scheduleData?.tasks?.length) return { minDate: new Date(), maxDate: new Date(), totalDays: 0 };
        
        const starts = scheduleData.tasks.map(t => new Date(t.start)).filter(d => !isNaN(d));
        const ends = scheduleData.tasks.map(t => new Date(t.end)).filter(d => !isNaN(d));
        
        const min = new Date(Math.min(...starts));
        const max = new Date(Math.max(...ends));
        
        // Add padding
        min.setDate(min.getDate() - 7);
        max.setDate(max.getDate() + 30);
        
        return { 
            minDate: min, 
            maxDate: max, 
            totalDays: (max - min) / (1000 * 60 * 60 * 24)
        };
    }, [scheduleData]);

    const timelineRuler = useMemo(() => {
        if (!minDate || !maxDate || isNaN(minDate.getTime()) || isNaN(maxDate.getTime())) return null;
        const months = [];
        let curr = new Date(minDate);
        while (curr <= maxDate) {
            months.push(new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(curr));
            curr.setMonth(curr.getMonth() + 1);
            if (months.length > 600) break; // Prevent infinite loop or too many ticks
        }
        return months.map(m => <div key={m} className="month-tick">{m}</div>);
    }, [minDate, maxDate]);

    const getX = (dateStr) => {
        const date = new Date(dateStr);
        if (isNaN(date)) return 0;
        const diff = (date - minDate) / (1000 * 60 * 60 * 24);
        return (diff / totalDays) * 100;
    };

    // LOB DATA PROCESSING
    const [lobFilter, setLobFilter] = useState('All'); // Filter by ETQ09_ACTIVIDAD

    const lobData = useMemo(() => {
        if (!scheduleData?.tasks) return { locations: [], series: [] };
        
        // 1. Get unique frentes + componentes for a more granular LBS
        const locMap = new Map();
        const activityTypes = new Set();

        scheduleData.tasks.forEach(t => {
            const f = t.udfs?.FRENTE;
            const c = t.udfs?.ETQ11_COMPONENTE;
            const e = t.udfs?.ETQ10_ESTRUCTURA;
            const type = t.udfs?.ETQ09_ACTIVIDAD || 'Other';
            
            if (f) {
                const fullLoc = [f, c, e].filter(Boolean).join(' / ');
                locMap.set(fullLoc, { f, c, e });
            }
            if (type) activityTypes.add(type);
        });
        
        const sortedLocations = Array.from(locMap.keys()).sort();
        const numLocs = sortedLocations.length || 1;
        const locIndex = {};
        sortedLocations.forEach((loc, i) => locIndex[loc] = i);
        
        // 2. Group by activity name (filter out WBS)
        const groups = {};
        scheduleData.tasks.forEach(t => {
            const f = t.udfs?.FRENTE;
            const c = t.udfs?.ETQ11_COMPONENTE;
            const e = t.udfs?.ETQ10_ESTRUCTURA;
            const type = t.udfs?.ETQ09_ACTIVIDAD || 'Other';
            if (!f) return;
            
            // Filter logic
            if (lobFilter !== 'All' && type !== lobFilter) return;

            const fullLoc = [f, c, e].filter(Boolean).join(' / ');
            if (!groups[t.name]) groups[t.name] = [];
            groups[t.name].push({
                x: getX(t.start),
                xEnd: getX(t.end),
                y: locIndex[fullLoc],
                name: t.name,
                type: type
            });
        });

        // 3. Create series (lines)
        const series = Object.entries(groups).map(([name, points]) => ({
            name,
            type: points[0]?.type,
            points: points.sort((a, b) => a.y - b.y)
        }));

        return { 
            locations: sortedLocations, 
            series, 
            numLocs, 
            activityTypes: ['All', ...Array.from(activityTypes).sort()] 
        };
    }, [scheduleData, minDate, totalDays, lobFilter]);

    // CONFLICT DETECTION LOGIC (Crossover)
    const conflicts = useMemo(() => {
        if (!lobData.series) return [];
        const detected = [];
        // Group points by location to detect overlaps in the same space
        const spaceOccupancy = {};
        lobData.series.forEach(s => {
            s.points.forEach(p => {
                if (!spaceOccupancy[p.y]) spaceOccupancy[p.y] = [];
                spaceOccupancy[p.y].push({ ...p, seriesName: s.name });
            });
        });

        // Detect if multiple activities are in the same location at the same time
        Object.entries(spaceOccupancy).forEach(([y, activities]) => {
            activities.sort((a, b) => a.x - b.x);
            for (let i = 0; i < activities.length - 1; i++) {
                if (activities[i].xEnd > activities[i+1].x) {
                    detected.push({
                        y: parseFloat(y),
                        x: activities[i].x,
                        name: `${activities[i].seriesName} & ${activities[i+1].seriesName}`
                    });
                }
            }
        });
        return detected;
    }, [lobData]);

    const getWidth = (start, end) => {
        const s = new Date(start);
        const e = new Date(end);
        if (isNaN(s) || isNaN(e)) return 0;
        let diff = (e - s) / (1000 * 60 * 60 * 24);
        if (diff <= 0) diff = 0.8; // At least 1 day equivalent for bar visibility
        return (diff / totalDays) * 100;
    };

    if (!scheduleData) return null;

    return (
        <div className="schedule-acc-layout">
            {/* Top Header - Autodesk Style */}
            <header className="acc-schedule-header">
                <div className="header-breadcrumbs">Schedule / <span>Project Schedule</span></div>
                <div className="header-main">
                    <h2>Cronograma de Obra V1.0</h2>
                    <div className="header-actions">
                        <button className="share-btn">Share</button>
                        <button className="settings-btn">Schedule settings</button>
                    </div>
                </div>
                <nav className="acc-tabs">
                    <button className={activeTab === 'Activities' ? 'active' : ''} onClick={() => setActiveTab('Activities')}>Activities</button>
                    <button className={activeTab === 'LOB' ? 'active' : ''} onClick={() => setActiveTab('LOB')}>Flowline (LOB)</button>
                    <button>Suggestions log (0)</button>
                </nav>
            </header>

            {/* Sub-toolbar */}
            <div className="acc-toolbar">
                <div className="toolbar-left">
                    <button className="primary-btn">Update schedule</button>
                    <div className="viewing-dropdown">Viewing ▾</div>
                </div>
                <div className="toolbar-right">
                    <div className="search-acc">
                        <input type="text" placeholder="Search activity..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                    <button className="filter-btn">Filters (1)</button>
                    <div className="view-toggle">
                        <select value={viewScale} onChange={e => setViewScale(e.target.value)} className="scale-select">
                            <option value="Day">Day</option>
                            <option value="Week">Week</option>
                            <option value="Month">Month</option>
                            <option value="Year">Year</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Split Content */}
            <div className="acc-content-split">
                {activeTab === 'Activities' ? (
                    <>
                        {/* Table Part */}
                        <div className="acc-table-side">
                            <div className="table-controls">
                                <button onClick={() => setExpandedRows(new Set())}>Collapse ALL</button>
                                <button onClick={() => setExpandedRows(new Set((scheduleData?.wbs || []).map(w => w.id)))}>Expand ALL</button>
                            </div>
                            <div className="table-scroll-area" ref={tableRef} onScroll={handleScroll}>
                                <table className="acc-table">
                                    <thead>
                                        <tr>
                                            <th style={{width: '60px'}}>ID</th>
                                            <th style={{width: '120px'}}>Activity Id</th>
                                            <th>Activity name</th>
                                            <th style={{width: '90px'}}>Start</th>
                                            <th style={{width: '90px'}}>Finish</th>
                                            <th style={{width: '60px'}}>% C</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayRows.map((row, idx) => (
                                            <tr key={row.id || idx} className={row.isWBS ? 'wbs-row' : 'task-row'}>
                                                <td>{idx + 1}</td>
                                                <td>{!row.isWBS ? row.activityId : ''}</td>
                                                <td style={{ paddingLeft: `${row.level * 20 + 10}px` }}>
                                                    {row.isWBS && (
                                                        <span 
                                                            className={`toggle-icon ${expandedRows.has(row.id) ? 'open' : ''}`}
                                                            onClick={() => toggleRow(row.id)}
                                                        >
                                                            ▸
                                                        </span>
                                                    )}
                                                    <span className="name-text">{row.name}</span>
                                                </td>
                                                <td>{row.start || ''}</td>
                                                <td>{row.end || ''}</td>
                                                <td>{row.percent}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Gantt Part */}
                        <div className="acc-gantt-side">
                            <div className="gantt-timeline-header">
                                <div className="timeline-months">
                                    {timelineRuler}
                                </div>
                            </div>
                            <div className="gantt-canvas" ref={ganttRef} onScroll={handleScroll}>
                                <div className="gantt-grid">
                                    {Array.from({ length: 12 }).map((_, i) => (
                                        <div key={i} className="grid-line" style={{ left: `${(i/12)*100}%` }}></div>
                                    ))}
                                </div>

                                {displayRows.map((row, idx) => (
                                    <div key={`gantt-${row.id || idx}`} className="gantt-row">
                                        {!row.isWBS && row.start && row.end ? (
                                            <div 
                                                className="gantt-bar-wrapper" 
                                                style={{ 
                                                    left: `${getX(row.start)}%`, 
                                                    width: `${Math.max(0.5, getWidth(row.start, row.end))}%` 
                                                }}
                                            >
                                                {(row.all_data?.Type?.includes('Milestone') || row.start === row.end) && (row.all_data?.PlannedDuration === "0" || !row.all_data?.PlannedDuration) ? (
                                                    <div className="gantt-milestone" title={row.name}>♦</div>
                                                ) : (
                                                    <div className="gantt-bar" title={`${row.name}: ${row.start} - ${row.end}`}>
                                                        <div className="gantt-progress" style={{ width: `${row.percent}%` }}></div>
                                                    </div>
                                                )}
                                                <span className="gantt-label">{row.name}</span>
                                            </div>
                                        ) : row.isWBS ? (
                                            <div className="gantt-summary-wrapper" style={{ left: `${getX(row.start)}%`, width: `${getWidth(row.start, row.end)}%` }}>
                                                <div className="gantt-summary-bar"></div>
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="lob-full-view">
                        <div className="lob-top-metrics">
                            <div className="metric-box">
                                <span className="m-val">{lobData.series.length}</span>
                                <span className="m-lbl">Active Streams</span>
                            </div>
                            <div className="metric-box warning">
                                <span className="m-val">{conflicts.length}</span>
                                <span className="m-lbl">Conflicts</span>
                            </div>
                            <div className="metric-box info">
                                <div className="filter-select-wrapper">
                                    <span className="m-lbl">Filter by Activity Type</span>
                                    <select 
                                        className="lob-type-filter"
                                        value={lobFilter}
                                        onChange={e => setLobFilter(e.target.value)}
                                    >
                                        {lobData.activityTypes.map(at => (
                                            <option key={at} value={at}>{at}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {lobData.locations.length === 0 ? (
                            <div className="lob-no-data">
                                <h3>No location data found (FRENTE)</h3>
                                <p>To use Line of Balance, activities must have the 'FRENTE' User Defined Field assigned in Primavera P6.</p>
                            </div>
                        ) : (
                            <div className="lob-container-premium">
                                <div className="lbs-explorer">
                                    <h4 className="lbs-title">LOCATION HIERARCHY</h4>
                                    <div className="lbs-list">
                                        {lobData.locations.map(loc => (
                                            <div key={loc} className="lbs-item">
                                                <span className="lbs-icon">📍</span> {loc}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                
                                <div className="lob-chart-area">
                                    <div className="lob-timeline-header">
                                        {timelineRuler}
                                    </div>
                                    
                                    <div className="lob-canvas-wrapper" style={{ overflow: 'auto' }}>
                                        <div className="lob-y-axis-labels">
                                            {lobData.locations.map((loc, i) => (
                                                <div key={loc} className="lob-loc-label" style={{ top: `${(i * 60) + 30}px` }}>
                                                    {loc}
                                                </div>
                                            ))}
                                        </div>
                                        <div className="lob-scrollable-area" style={{ 
                                            width: `${timelineRuler?.length * 200}px`, 
                                            height: `${lobData.locations.length * 60}px`,
                                            position: 'relative'
                                        }}>
                                            <svg className="lob-svg-premium" width="100%" height="100%" viewBox={`0 0 ${timelineRuler?.length * 200} ${lobData.locations.length * 60}`} preserveAspectRatio="none">
                                                {/* Grids */}
                                                {lobData.locations.map((_, i) => (
                                                    <line key={i} x1="0" y1={i * 60} x2={timelineRuler?.length * 200} y2={i * 60} stroke="#f1f5f9" strokeWidth="1" />
                                                ))}
                                                {Array.from({length: timelineRuler?.length || 0}).map((_, i) => (
                                                    <line key={i} x1={i * 200} y1="0" x2={i * 200} y2={lobData.locations.length * 60} stroke="#f1f5f9" strokeWidth="1" />
                                                ))}

                                                {/* Conflict Markers */}
                                                {conflicts.map((c, i) => {
                                                    const xPos = (c.x / 100) * (timelineRuler?.length * 200);
                                                    const yPos = (c.y * 60) + 30;
                                                    return (
                                                        <circle 
                                                            key={`conf-${i}`}
                                                            cx={xPos} 
                                                            cy={yPos} 
                                                            r="6" 
                                                            fill="rgba(255, 0, 0, 0.4)"
                                                            stroke="red"
                                                            strokeWidth="1"
                                                        />
                                                    );
                                                })}

                                                {/* Flow lines */}
                                                {lobData.series.map((s, i) => (
                                                    <polyline 
                                                        key={s.name}
                                                        points={s.points.map(p => {
                                                            const px = (p.x / 100) * (timelineRuler?.length * 200);
                                                            const py = (p.y * 60) + 30;
                                                            return `${px},${py}`;
                                                        }).join(' ')}
                                                        fill="none"
                                                        stroke={`hsl(${(i * 137.5) % 360}, 75%, 50%)`}
                                                        strokeWidth="2"
                                                        className="lob-flow-line-premium"
                                                    >
                                                        <title>{s.name}</title>
                                                    </polyline>
                                                ))}
                                            </svg>
                                        </div>
                                    </div>
                                    
                                    {/* Legend Bottom */}
                                    <div className="lob-legend-premium">
                                        {lobData.activityTypes.filter(t => t !== 'All').map((type, i) => (
                                            <div key={type} className="legend-item-p">
                                                <div className="l-color" style={{ background: `hsl(${(i * 137.5) % 360}, 75%, 50%)` }}></div>
                                                <span>{type}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ScheduleDetailedView;
