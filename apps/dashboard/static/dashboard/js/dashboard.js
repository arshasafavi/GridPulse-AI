document.addEventListener("DOMContentLoaded", function () {
    setupOverviewPage();
    setupScenarioPage();
});

function setupOverviewPage() {
    const rangeSelect = document.getElementById("rangeSelect");
    const refreshBtn = document.getElementById("refreshDashboardBtn");
    const mainChart = document.getElementById("mainForecastChart");

    if (!mainChart) return;

    const loadOverviewDashboard = async () => {
        const city = "Izmir";
        const rangeValue = rangeSelect ? rangeSelect.value : "168";
        const parsed = parseRangeSelection(rangeValue);
        const horizon = parsed.horizon;
        const direction = parsed.direction;

        // remember latest request parameters for pagination fetches
        window.latestForecastRequest = { city: city, horizon: horizon, direction: direction };

        try {
            setLoadingState(true);

            const pageSize = window.forecastPageSize || 12;
            const chartSamples = horizon > 72 ? Math.min(336, horizon) : Math.min(168, horizon);
            const [overviewData, forecastData] = await Promise.all([
                fetchOverview(horizon),
                fetchForecast(horizon, direction, 0, pageSize, chartSamples)
            ]);

            updateUpdatedAt(overviewData.updated_at);
            updateOverviewKpis(overviewData);
            updateOverviewInsights({ insights: buildInsightsFromForecast(forecastData) });
            updateOverviewMiniCharts({ mini_charts: buildMiniChartsFromForecast(forecastData) });
            updateForecastTable(forecastData);
            try {
                const chartData = forecastData.chart_predictions ? { predictions: forecastData.chart_predictions } : forecastData;
                renderOverviewForecastChart(chartData);
            } catch (e) { console.debug('render with page/chart data failed:', e); }
            if (horizon <= 72) {
                fetchForecast(horizon, direction, null, null).then((full) => { try { renderOverviewForecastChart(full); } catch (e) { console.debug('render full chart failed:', e); } }).catch((err) => console.debug('full forecast fetch for chart failed:', err));
            }
            updateForecastBadge(horizon, direction);
        } catch (error) {
            console.error("Overview dashboard load error:", error);
        } finally {
            setLoadingState(false);
        }
    };

    if (refreshBtn) {
        refreshBtn.addEventListener("click", loadOverviewDashboard);
    }

    if (rangeSelect) {
        rangeSelect.addEventListener("change", loadOverviewDashboard);
    }

    const exportBtn = document.getElementById("exportForecastCsvBtn");
    if (exportBtn) {
        exportBtn.addEventListener("click", () => {
            const parsed = parseRangeSelection(rangeSelect ? rangeSelect.value : "next_24");
            const horizon = parsed.horizon;
            const direction = parsed.direction;
            const url = new URL(window.dashboardConfig.forecastExportUrl, window.location.origin);
            url.searchParams.set("horizon", horizon);
            url.searchParams.set("direction", direction);
            window.location.href = url.toString();
        });
    }

    loadOverviewDashboard();
}

function parseRangeSelection(rangeValue) {
    if (!rangeValue) return { direction: "next", horizon: 24 };
    const raw = String(rangeValue);
    let direction = "next";
    if (raw.startsWith("last_")) direction = "last";
    else if (raw.startsWith("next_")) direction = "next";
    const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    return {
        direction,
        horizon: (!Number.isNaN(n) && n > 0) ? n : 24,
    };
}

async function fetchOverview(horizon = 24) {
    const url = `${window.dashboardConfig.overviewApiUrl}?horizon=${encodeURIComponent(horizon)}`;
    console.debug(`fetchOverview START -> ${url}`);
    const response = await fetch(url);
    console.debug(`fetchOverview END -> ${url} status=${response.status}`);

    if (!response.ok) {
        throw new Error("Failed to fetch overview data");
    }

    return await response.json();
}

async function fetchForecast(horizon = 24, direction = "next", start = null, limit = null, chart_samples = null) {
    const url = new URL(window.dashboardConfig.forecastApiUrl, window.location.origin);
    url.searchParams.set('horizon', String(horizon));
    url.searchParams.set('direction', String(direction));
    if (start !== null && start !== undefined) url.searchParams.set('start', String(start));
    if (limit !== null && limit !== undefined) url.searchParams.set('limit', String(limit));
    if (chart_samples !== null && chart_samples !== undefined) url.searchParams.set('chart_samples', String(chart_samples));

    console.debug(`fetchForecast START -> ${url.toString()}`);
    const response = await fetch(url.toString());
    console.debug(`fetchForecast END -> ${url.toString()} status=${response.status}`);

    if (!response.ok) {
        throw new Error("Failed to fetch forecast data");
    }

    const data = await response.json();
    console.debug('fetchForecast JSON ->', data);
    return data;
}

async function fetchMetrics(city, horizon = 24) {
    const url = `${window.dashboardConfig.metricsApiUrl}?city=${encodeURIComponent(city)}&horizon=${horizon}`;
    console.debug(`fetchMetrics START -> ${url}`);
    const response = await fetch(url);
    console.debug(`fetchMetrics END -> ${url} status=${response.status}`);

    if (!response.ok) {
        throw new Error("Failed to fetch metrics data");
    }

    return await response.json();
}

function updateOverviewKpis(data) {
    const kpis = data.kpis || {};

    const demand = kpis.current_demand != null ? `${formatNumber(kpis.current_demand)} MWh` : "- MWh";
    setText("kpiCurrentDemand", demand);

    if (kpis.current_change_pct != null) {
        const arrow = kpis.current_change_pct >= 0 ? "bi-arrow-up-right" : "bi-arrow-down-right";
        setHTML("kpiCurrentChange", `<i class="bi ${arrow}"></i> ${kpis.current_change_pct}% vs previous hour`);
    } else {
        setText("kpiCurrentChange", "- vs previous hour");
    }

    setText("kpiPeakForecast", kpis.peak_forecast != null ? `${formatNumber(kpis.peak_forecast)} MWh` : "- MWh");
    setText("kpiPeakHour", `Expected at ${kpis.peak_hour ?? "-"}`);
    setText("kpiDailyAverage", kpis.daily_average != null ? `${formatNumber(kpis.daily_average)} MWh` : "- MWh");
    setText("kpiTemperature", kpis.temperature != null ? `${kpis.temperature}°C` : "-°C");
    setText("kpiDayType", `${kpis.day_type ?? "-"} • ${kpis.weather_note ?? "-"}`);
}

function updateUpdatedAt(isoString) {
    const el = document.getElementById("updatedAtValue");
    if (!el) return;
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return;
    el.textContent = `Updated: ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:00`;
}

function updateOverviewInsights(data) {
    const insights = data.insights || {};

    setText("insightPeakHour", insights.peak_hour ?? "-");
    setText("insightLowestHour", insights.lowest_hour ?? "-");
    setText("insightDemandTrend", insights.demand_trend ?? "-");
    setText("insightWeatherEffect", insights.weather_effect ?? "-");
    setText("insightHolidayImpact", insights.holiday_impact ?? "-");
    setText("insightModelConfidence", insights.model_confidence ?? "-");
}

function updateOverviewMiniCharts(data) {
    const charts = data.mini_charts || {};

    renderDailyLoadPattern(charts.daily_load_pattern || []);
    renderTemperatureVsDemand(charts.temperature_vs_demand || []);
    renderWeeklyTrend(charts.weekly_trend || []);
}

function buildInsightsFromForecast(forecastData) {
    const preds = (forecastData && forecastData.predictions) ? forecastData.predictions : [];
    if (!preds.length) {
        return {
            peak_hour: "-",
            lowest_hour: "-",
            demand_trend: "-",
            weather_effect: "-",
            holiday_impact: "-",
            model_confidence: "-"
        };
    }

    const peak = preds.reduce((a, b) => (a.predicted_demand >= b.predicted_demand ? a : b));
    const low = preds.reduce((a, b) => (a.predicted_demand <= b.predicted_demand ? a : b));

    const half = Math.max(1, Math.floor(preds.length / 2));
    const first = preds.slice(0, half).map((p) => Number(p.predicted_demand || 0));
    const second = preds.slice(half).map((p) => Number(p.predicted_demand || 0));
    const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

    let demandTrend = "Stable";
    const firstAvg = avg(first);
    const secondAvg = avg(second);
    if (secondAvg > firstAvg * 1.03) demandTrend = "Increasing";
    else if (secondAvg < firstAvg * 0.97) demandTrend = "Decreasing";

    const temp = Number(preds[0].temperature);
    let weatherEffect = "Unknown";
    if (!Number.isNaN(temp)) {
        if (temp > 30 || temp < 5) weatherEffect = "High";
        else if (temp > 22 || temp < 12) weatherEffect = "Moderate";
        else weatherEffect = "Low";
    }

    const holidayImpact = preds.some((p) => !!p.is_holiday) ? "High" : "Low";
    const modelUsed = preds[0].model_used || "";
    const confidence = modelUsed === "model_24" ? "High (model_24)" : "Medium (model_no_timeseries)";

    return {
        peak_hour: formatHourLabel(peak.datetime),
        lowest_hour: formatHourLabel(low.datetime),
        demand_trend: demandTrend,
        weather_effect: weatherEffect,
        holiday_impact: holidayImpact,
        model_confidence: confidence,
    };
}

function buildMiniChartsFromForecast(forecastData) {
    const preds = (forecastData && forecastData.predictions) ? forecastData.predictions : [];
    if (!preds.length) {
        return { daily_load_pattern: [], temperature_vs_demand: [], weekly_trend: [] };
    }

    const daily = preds.slice(0, Math.min(24, preds.length)).map((p) => ({
        hour: formatHourLabel(p.datetime),
        demand: p.predicted_demand,
    }));

    const temperature = preds
        .filter((p) => p.temperature !== null && p.temperature !== undefined)
        .map((p) => ({ temperature: Math.round(Number(p.temperature)), demand: p.predicted_demand }));

    const weekdayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const agg = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] };
    preds.forEach((p) => {
        const d = new Date(p.datetime);
        if (Number.isNaN(d.getTime())) return;
        const key = d.toLocaleString("en-US", { weekday: "short" });
        if (!agg[key]) agg[key] = [];
        agg[key].push(Number(p.predicted_demand || 0));
    });

    const weekly = weekdayOrder.map((d) => {
        const vals = agg[d] || [];
        return { day: d, demand: vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0 };
    });

    return {
        daily_load_pattern: daily,
        temperature_vs_demand: temperature,
        weekly_trend: weekly,
    };
}

function buildMiniChartsFromMetrics(metricsData, forecastData) {
    const series = (metricsData && metricsData.series && metricsData.series.actual) ? metricsData.series.actual : [];

    const hourly = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }));
    const weeklyAgg = {}; // short day -> {sum,count}

    series.forEach((it) => {
        try {
            const dt = new Date(it.datetime);
            const hour = dt.getUTCHours();
            hourly[hour].sum += Number(it.value || 0);
            hourly[hour].count += 1;

            const weekday = dt.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
            const key = weekday;
            if (!weeklyAgg[key]) weeklyAgg[key] = { sum: 0, count: 0 };
            weeklyAgg[key].sum += Number(it.value || 0);
            weeklyAgg[key].count += 1;
        } catch (e) {
            // ignore parse errors
        }
    });

    const daily_load_pattern = hourly.map((h, idx) => ({ hour: String(idx).padStart(2, '0') + ':00', demand: h.count ? Math.round(h.sum / h.count) : 0 }));

    const weekdayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekly_trend = weekdayOrder.map((d) => {
        const v = weeklyAgg[d];
        return { day: d, demand: v && v.count ? Math.round(v.sum / v.count) : 0 };
    });

    // temperature_vs_demand: use forecast predictions if available (best-effort)
    let temperature_vs_demand = [];
    const preds = (forecastData && forecastData.predictions) ? forecastData.predictions : [];
    if (preds.length) {
        temperature_vs_demand = preds.map((p) => ({ temperature: p.temperature ? Math.round(p.temperature) : null, demand: p.predicted_demand }));
    }

    return {
        daily_load_pattern,
        temperature_vs_demand,
        weekly_trend,
    };
}

function updateForecastTable(data) {
    // Handle server-paged or full responses and render first page
    const tbody = document.getElementById("forecastTableBody");
    if (!tbody) return;

    window.forecastPageSize = window.forecastPageSize || 12;
    window.forecastCache = window.forecastCache || {};
    window.serverPaged = false;
    window.latestForecastTotal = 0;

    // If the server returned a total_predictions field, treat as server-paged
    if (data && typeof data.total_predictions === 'number' && data.total_predictions > (data.predictions || []).length) {
        window.serverPaged = true;
        window.latestForecastTotal = data.total_predictions;
        // cache first page
        window.forecastCache[1] = data.predictions || [];
    } else {
        // full data returned; cache as page 1 but mark total accordingly
        const preds = (data && data.predictions) ? data.predictions : [];
        window.serverPaged = false;
        window.latestForecastTotal = preds.length;
        window.forecastCache[1] = preds;
    }

    renderForecastPage(1);
}

function renderForecastPage(page) {
    const tbody = document.getElementById("forecastTableBody");
    if (!tbody) return;

    const pageSize = window.forecastPageSize || 12;
    const total = window.latestForecastTotal || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(Math.max(1, page || 1), totalPages);

    // if server-paged and page not cached, fetch that page
    if (window.serverPaged) {
        const cached = window.forecastCache[current];
        if (!cached) {
            // fetch page from server
            const req = window.latestForecastRequest || {};
            const city = req.city || (window.dashboardConfig && window.dashboardConfig.city) || 'Izmir';
            const horizon = req.horizon || 24;
            const direction = req.direction || 'next';
            const start = (current - 1) * pageSize;
            showForecastLoading();
            fetchForecast(horizon, direction, start, pageSize).then((resp) => {
                window.forecastCache[current] = resp.predictions || [];
                window.latestForecastTotal = resp.total_predictions || window.latestForecastTotal;
                clearForecastLoading();
                renderForecastPage(current);
            }).catch((err) => {
                console.error('Failed to load forecast page:', err);
                clearForecastLoading();
                showForecastError();
            });
            return;
        }
    }

    const predictions = (window.serverPaged ? (window.forecastCache[current] || []) : (window.forecastCache[1] || []));
    tbody.innerHTML = "";

    if (!predictions.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4">No forecast data available</td></tr>`;
        renderForecastPagination(0, 0, 0);
        return;
    }

    const start = 0;
    const pageItems = predictions.slice(start, start + pageSize);

    pageItems.forEach((row) => {
        const tr = document.createElement("tr");

        const histMean = row.historical_mean;
        const diff = (histMean === null || histMean === undefined) ? null : (row.predicted_demand - histMean);
        const diffPct = (diff === null || histMean === 0) ? null : (histMean ? (diff / histMean) * 100 : null);

        let diffBadge = "<span class=\"badge bg-light text-dark border\">Normal</span>";
        if (diffPct !== null && !Number.isNaN(diffPct)) {
            if (diffPct >= 10) diffBadge = `<span class=\"badge-diff-high\">+${diffPct.toFixed(1)}%</span>`;
            else if (diffPct <= -10) diffBadge = `<span class=\"badge-diff-low\">${diffPct.toFixed(1)}%</span>`;
            else diffBadge = `<span class=\"badge-diff-mod\">${diffPct.toFixed(1)}%</span>`;
        }

        // Format temperature as integer (no decimals)
        let tempOut = "-";
        if (row.temperature !== null && row.temperature !== undefined) {
            const t = Number(row.temperature);
            if (!Number.isNaN(t)) tempOut = `${Math.round(t)}°C`;
        }

        // Format humidity as integer (no decimals)
        let humOut = "-";
        if (row.humidity !== null && row.humidity !== undefined) {
            const h = Number(row.humidity);
            if (!Number.isNaN(h)) humOut = `${Math.round(h)}%`;
        }

        tr.innerHTML = `
            <td>${formatDateTime(row.datetime)}</td>
            <td>${formatNumber(row.predicted_demand)} MWh</td>
            <td>${histMean !== null && histMean !== undefined ? formatNumber(histMean) + ' MWh' : '-'}</td>
            <td>${diff !== null ? formatNumber(Math.round(diff)) + ' MWh' : '-'}</td>
            <td>${diffPct !== null && !Number.isNaN(diffPct) ? diffBadge : '-'}</td>
            <td>${tempOut}</td>
            <td>${humOut}</td>
            <td>${row.is_holiday ? "Yes" : "No"}</td>
            <td>${renderStatusBadge(row.status)}</td>
        `;

        tbody.appendChild(tr);
    });

    renderForecastPagination(current, totalPages, total);
}

function renderForecastPagination(current, totalPages, totalItems) {
    // Find the table and place controls after it
    const tbody = document.getElementById("forecastTableBody");
    if (!tbody) return;
    const table = tbody.closest('table');
    if (!table) return;

    let container = document.getElementById('forecastPaginationControls');
    if (!container) {
        container = document.createElement('div');
        container.id = 'forecastPaginationControls';
        container.className = 'd-flex justify-content-between align-items-center mt-2';
        table.parentNode.insertBefore(container, table.nextSibling);
    }

    if (!totalItems) {
        container.innerHTML = '';
        return;
    }

    const prevDisabled = current <= 1 ? 'disabled' : '';
    const nextDisabled = current >= totalPages ? 'disabled' : '';

    container.innerHTML = `
        <div class="d-flex align-items-center">
            <div class="me-3">Showing ${(current-1)*window.forecastPageSize + 1} - ${Math.min(current*window.forecastPageSize, totalItems)} of ${totalItems}</div>
            <div class="me-3">Page size:
                <select id="forecastPageSizeSelect" class="form-select form-select-sm d-inline-block ms-2" style="width: auto;"> 
                    <option value="12" ${window.forecastPageSize==12? 'selected':''}>12</option>
                    <option value="24" ${window.forecastPageSize==24? 'selected':''}>24</option>
                    <option value="48" ${window.forecastPageSize==48? 'selected':''}>48</option>
                    <option value="96" ${window.forecastPageSize==96? 'selected':''}>96</option>
                </select>
            </div>
        </div>
        <div class="d-flex align-items-center">
            <button id="forecastPrevBtn" class="btn btn-sm btn-outline-primary me-2" ${prevDisabled}>Prev</button>
            <div id="forecastPageNumbers" class="btn-group me-2" role="group"></div>
            <span class="mx-1">Page ${current} / ${totalPages}</span>
            <button id="forecastNextBtn" class="btn btn-sm btn-outline-primary ms-2" ${nextDisabled}>Next</button>
        </div>
    `;

    const prev = document.getElementById('forecastPrevBtn');
    const next = document.getElementById('forecastNextBtn');
    if (prev) prev.onclick = () => { if (current > 1) renderForecastPage(current - 1); };
    if (next) next.onclick = () => { if (current < totalPages) renderForecastPage(current + 1); };

    // page size selector handler
    const pageSizeSelect = document.getElementById('forecastPageSizeSelect');
    if (pageSizeSelect) {
        pageSizeSelect.onchange = () => {
            const newSize = Number(pageSizeSelect.value) || 12;
            window.forecastPageSize = newSize;
            // clear cache so pages will be refetched with new limit when serverPaged
            window.forecastCache = {};
            renderForecastPage(1);
        };
    }

    // render numeric page buttons (windowed)
    const pageNumbersEl = document.getElementById('forecastPageNumbers');
    if (pageNumbersEl) {
        pageNumbersEl.innerHTML = '';
        const maxButtons = 7;
        let startPage = Math.max(1, current - Math.floor(maxButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxButtons - 1);
        if (endPage - startPage + 1 < maxButtons) {
            startPage = Math.max(1, endPage - maxButtons + 1);
        }

        for (let p = startPage; p <= endPage; p++) {
            const btn = document.createElement('button');
            btn.className = `btn btn-sm ${p === current ? 'btn-primary' : 'btn-outline-secondary'}`;
            btn.textContent = String(p);
            btn.onclick = (() => { const pageNum = p; return () => renderForecastPage(pageNum); })();
            pageNumbersEl.appendChild(btn);
        }
    }
}

function renderOverviewForecastChart(data) {
    const target = document.getElementById("mainForecastChart");
    if (!target || !window.Plotly) return;
    if (target.dataset.staticChart === "1") return;

    const predictions = data.predictions || [];
    const x = predictions.map((item) => formatDateTime(item.datetime));
    const predicted = predictions.map((item) => item.predicted_demand);

    Plotly.newPlot(
        target,
        [
            {
                x: x,
                y: predicted,
                type: "scatter",
                mode: "lines",
                name: "Predicted",
                line: { width: 3 }
            }
        ],
        {
            margin: { t: 10, r: 10, b: 45, l: 55 },
            paper_bgcolor: "white",
            plot_bgcolor: "white",
            legend: { orientation: "h" },
            xaxis: { title: "Time" },
            yaxis: { title: "Demand (MWh)" }
        },
        { responsive: true, displayModeBar: false }
    );
}

function renderDailyLoadPattern(points) {
    const target = document.getElementById("dailyLoadPattern");
    if (!target || !window.Plotly) return;
    if (target.dataset.staticChart === "1") return;

    Plotly.newPlot(
        target,
        [{
            x: points.map((p) => p.hour),
            y: points.map((p) => p.demand),
            type: "scatter",
            mode: "lines+markers",
            line: { width: 3 },
            name: "Load Pattern"
        }],
        {
            margin: { t: 10, r: 10, b: 35, l: 40 },
            paper_bgcolor: "white",
            plot_bgcolor: "white",
            xaxis: { title: "Hour" },
            yaxis: { title: "Demand" }
        },
        { responsive: true, displayModeBar: false }
    );
}

function renderTemperatureVsDemand(points) {
    const target = document.getElementById("tempDemandChart");
    if (!target || !window.Plotly) return;
    if (target.dataset.staticChart === "1") return;

    Plotly.newPlot(
        target,
        [{
            x: points.map((p) => p.temperature),
            y: points.map((p) => p.demand),
            mode: "markers",
            type: "scatter",
            name: "Temp vs Demand"
        }],
        {
            margin: { t: 10, r: 10, b: 35, l: 40 },
            paper_bgcolor: "white",
            plot_bgcolor: "white",
            xaxis: { title: "Temperature" },
            yaxis: { title: "Demand" }
        },
        { responsive: true, displayModeBar: false }
    );
}

function renderWeeklyTrend(points) {
    const target = document.getElementById("weeklyTrendChart");
    if (!target || !window.Plotly) return;
    if (target.dataset.staticChart === "1") return;

    Plotly.newPlot(
        target,
        [{
            x: points.map((p) => p.day),
            y: points.map((p) => p.demand),
            type: "bar",
            name: "Weekly Trend"
        }],
        {
            margin: { t: 10, r: 10, b: 35, l: 40 },
            paper_bgcolor: "white",
            plot_bgcolor: "white",
            xaxis: { title: "Day" },
            yaxis: { title: "Demand" }
        },
        { responsive: true, displayModeBar: false }
    );
}

function updateForecastBadge(horizon, direction = "next") {
    const el = document.getElementById("forecastHorizonBadge");
    if (!el) return;

    let label = "";
    const prefix = direction === "last" ? "Last" : "Next";
    if (horizon === 24) label = `${prefix} 24 Hours`;
    else if (horizon === 6) label = `${prefix} 6 Hours`;
    else if (horizon === 12) label = `${prefix} 12 Hours`;
    else if (horizon === 48) label = `${prefix} 48 Hours`;
    else if (horizon === 72) label = `${prefix} 72 Hours`;
    else if (horizon === 96) label = `${prefix} 4 Days`;
    else if (horizon === 168) label = `${prefix} 7 Days`;
    else if (horizon === 240) label = `${prefix} 10 Days`;
    else if (horizon === 336) label = `${prefix} 2 Weeks`;
    else label = `${prefix} ${horizon} Hours`;
    el.textContent = label;
}

function setupScenarioPage() {
    const scenarioChart = document.getElementById("scenarioComparisonChart");
    if (!scenarioChart) return;

    const modelSelect = document.getElementById("scenarioModelSelect");
    const modelHelp = document.getElementById("scenarioModelHelp");
    const sliderGroup = document.getElementById("scenarioSliderGroup");
    const inputModeSelect = document.getElementById("ntsInputMode");
    const singleControls = document.getElementById("ntsSingleControls");
    const perTimeControls = document.getElementById("ntsPerTimeControls");
    const tempRange = document.getElementById("tempDeltaRange");
    const humidityRange = document.getElementById("humidityDeltaRange");
    const windRange = document.getElementById("windDeltaRange");
    const prcpRange = document.getElementById("prcpDeltaRange");
    const horizonSelect = document.getElementById("scenarioHorizonSelect");
    const weekendSwitch = document.getElementById("weekendSwitch");
    const runScenarioBtn = document.getElementById("runScenarioBtn");

    const modelHorizonOptions = {
        model_24: [24, 72, 168, 336],
        model_no_timeseries: [1, 24, 72, 168, 336, 504, 720],
    };

    function horizonLabel(hours) {
        if (hours === 1) return "1 Hour (single point)";
        if (hours === 24) return "Next 24 Hours";
        if (hours === 72) return "Next 72 Hours";
        if (hours === 168) return "Next 7 Days";
        if (hours === 336) return "Next 2 Weeks";
        if (hours === 504) return "Next 3 Weeks";
        if (hours === 720) return "Next 30 Days";
        return `Next ${hours} Hours`;
    }

    function updateHorizonOptions(selectedModel) {
        if (!horizonSelect) return;
        const current = Number(horizonSelect.value || 24);
        const options = modelHorizonOptions[selectedModel] || modelHorizonOptions.model_24;
        horizonSelect.innerHTML = "";
        options.forEach((h) => {
            const opt = document.createElement("option");
            opt.value = String(h);
            opt.textContent = horizonLabel(h);
            if (h === current) opt.selected = true;
            horizonSelect.appendChild(opt);
        });
        if (!options.includes(current) && horizonSelect.options.length) {
            horizonSelect.options[0].selected = true;
        }
    }

    function applyModelMode() {
        const model = (modelSelect && modelSelect.value) ? modelSelect.value : "model_24";
        updateHorizonOptions(model);

        const useSliders = model === "model_no_timeseries";
        if (sliderGroup) sliderGroup.style.display = useSliders ? "block" : "none";

        const inputMode = (inputModeSelect && inputModeSelect.value) ? inputModeSelect.value : "single";
        if (singleControls) singleControls.style.display = (useSliders && inputMode === "single") ? "block" : "none";
        if (perTimeControls) perTimeControls.style.display = (useSliders && inputMode === "per_time") ? "block" : "none";

        [tempRange, humidityRange, windRange, prcpRange, weekendSwitch].forEach((el) => {
            if (el) el.disabled = !(useSliders && inputMode === "single");
        });

        if (modelHelp) {
            if (!useSliders) {
                modelHelp.textContent = "Use this for real hourly forecasts up to 2 weeks. Only choose a time range and run.";
            } else if (inputMode === "per_time") {
                modelHelp.textContent = "Per-time mode: enter one or multiple timestamp rows with weather values. One row supports single-hour prediction.";
            } else {
                modelHelp.textContent = "Single mode: one slider setup is applied across the selected horizon.";
            }
        }

        updateScenarioSummary();
    }

    if (modelSelect) {
        modelSelect.addEventListener("change", applyModelMode);
    }
    if (inputModeSelect) {
        inputModeSelect.addEventListener("change", applyModelMode);
    }

    bindRangeLabel(tempRange, "tempDeltaValue", "°C", true);
    bindRangeLabel(humidityRange, "humidityDeltaValue", "%", true);
    bindRangeLabel(windRange, "windDeltaValue", " m/s", true);
    bindRangeLabel(prcpRange, "prcpDeltaValue", " mm", true);

    updateScenarioSummary();

    [tempRange, humidityRange, windRange, prcpRange].forEach((el) => {
        if (el) el.addEventListener("input", updateScenarioSummary);
    });

    [weekendSwitch].forEach((el) => {
        if (el) el.addEventListener("change", updateScenarioSummary);
    });

    const loadScenario = async () => {
        try {
            const payload = collectScenarioPayload();
            if (!payload) return; // validation failed or incomplete
            const data = await postScenario(payload);
            updateScenarioUI(data);
        } catch (error) {
            console.error("Scenario load error:", error);
        }
    };

    if (runScenarioBtn) {
        runScenarioBtn.addEventListener("click", loadScenario);
    }

    // Pre-fill date + hour pickers with current local datetime (rounded to hour)
    const ntsStartDate = document.getElementById("ntsStartDate");
    const ntsStartHour = document.getElementById("ntsStartHour");
    if (ntsStartDate && !ntsStartDate.value) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        ntsStartDate.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        if (ntsStartHour) ntsStartHour.value = String(now.getHours());
    }

    applyModelMode();
    loadScenario();
}

function updateScenarioSummary() {
    const model = document.getElementById("scenarioModelSelect")?.value || "model_24";
    const inputMode = document.getElementById("ntsInputMode")?.value || "single";
    const temp = Number(document.getElementById("tempDeltaRange")?.value || 0);
    const humidity = Number(document.getElementById("humidityDeltaRange")?.value || 0);
    const weekend = document.getElementById("weekendSwitch")?.checked || false;

    if (model === "model_24") {
        setText("summaryTemp", "Auto (not required)");
        setText("summaryHumidity", "Auto (not required)");
        setText("summaryWeekend", "Auto (calendar)");
        return;
    }

    if (inputMode === "per_time") {
        setText("summaryTemp", "Custom per-time rows");
        setText("summaryHumidity", "Custom per-time rows");
        setText("summaryWeekend", weekend ? "Weekend Override: Yes" : "Weekend Override: No");
        return;
    }

    setText("summaryTemp", `${formatSigned(temp)}°C`);
    setText("summaryHumidity", `${formatSigned(humidity)}%`);
    setText("summaryWeekend", weekend ? "Yes" : "No");
}

function collectScenarioPayload() {
    const modelChoice = document.getElementById("scenarioModelSelect")?.value || "model_24";
    const payload = {
        model_choice: modelChoice,
        horizon: Number(document.getElementById("scenarioHorizonSelect")?.value || 24),
        mode: "horizon",
    };

    if (modelChoice === "model_no_timeseries") {
        const inputMode = document.getElementById("ntsInputMode")?.value || "single";
        payload.input_mode = inputMode;

        if (inputMode === "per_time") {
            const raw = (document.getElementById("ntsSeriesInput")?.value || "").trim();
            if (!raw) {
                alert("Please provide at least one per-time input row.");
                return null;
            }
            const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
            const parsed = [];
            lines.forEach((line) => {
                const parts = line.split(",").map((p) => p.trim());
                if (parts.length < 5) return;
                const dt = parts[0];
                const t = Number(parts[1]);
                const h = Number(parts[2]);
                const w = Number(parts[3]);
                const p = Number(parts[4]);
                const hol = parts.length >= 6 ? String(parts[5]) === "1" : false;
                if ([t, h, w, p].some((v) => Number.isNaN(v))) return;
                parsed.push({
                    datetime: dt,
                    temperature: t,
                    humidity: h,
                    wind_speed: w,
                    precipitation: p,
                    is_holiday: hol,
                });
            });
            if (!parsed.length) {
                alert("No valid rows found. Use: datetime,temp,humidity,wind,precip,holiday");
                return null;
            }
            payload.per_timestep_inputs = parsed;
            payload.horizon = parsed.length;
            payload.is_weekend = document.getElementById("weekendSwitch")?.checked || false;
            return payload;
        }

        payload.temperature_delta = Number(document.getElementById("tempDeltaRange")?.value || 0);
        payload.humidity_delta = Number(document.getElementById("humidityDeltaRange")?.value || 0);
        payload.wind_speed_delta = Number(document.getElementById("windDeltaRange")?.value || 0);
        payload.precipitation_delta = Number(document.getElementById("prcpDeltaRange")?.value || 0);
        payload.is_weekend = document.getElementById("weekendSwitch")?.checked || false;

        const startDateVal = document.getElementById("ntsStartDate")?.value;
        const startHourVal = document.getElementById("ntsStartHour")?.value || "0";
        if (startDateVal) {
            const pad = (n) => String(n).padStart(2, "0");
            payload.start_date = `${startDateVal}T${pad(Number(startHourVal))}:00`;
        }
    }

    return payload;
}

async function postScenario(payload) {
    const response = await fetch(window.scenarioConfig.scenarioApiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error("Failed to fetch scenario API");
    }

    return await response.json();
}

function updateScenarioUI(data) {
    renderScenarioChartFromApi(data);
    updateScenarioCardsFromApi(data.summary || {});
    updateScenarioTable(data.table || []);
    updateScenarioNarrative(data);
}

function renderScenarioChartFromApi(data) {
    const target = document.getElementById("scenarioComparisonChart");
    if (!target || !window.Plotly) return;

    const scenario = data.scenario || [];

    Plotly.newPlot(
        target,
        [
            {
                x: scenario.map((item) => formatDateTime(item.datetime)),
                y: scenario.map((item) => item.demand),
                type: "scatter",
                mode: "lines+markers",
                name: "Scenario",
                line: { width: 3 }
            }
        ],
        {
            margin: { t: 10, r: 10, b: 45, l: 55 },
            paper_bgcolor: "white",
            plot_bgcolor: "white",
            legend: { orientation: "h" },
            xaxis: { title: "Time" },
            yaxis: { title: "Demand (MWh)" }
        },
        { responsive: true, displayModeBar: false }
    );
}

function updateScenarioCardsFromApi(summary) {
    setText("peakScenarioValue", summary.scenario_peak != null ? `${formatNumber(summary.scenario_peak)} MWh` : "- MWh");
    setText("lowestScenarioValue", summary.scenario_min != null ? `${formatNumber(summary.scenario_min)} MWh` : "- MWh");
    const risk = summary.risk_level ?? "Low";
    setText("riskLevelValue", risk);

    const riskCard = document.getElementById("scenarioRiskCard");
    if (riskCard) {
        riskCard.classList.remove("metric-success", "metric-warning", "metric-danger");
        if (risk === "High") riskCard.classList.add("metric-danger");
        else if (risk === "Medium") riskCard.classList.add("metric-warning");
        else riskCard.classList.add("metric-success");
    }
}

function updateScenarioTable(rows) {
    const tbody = document.getElementById("scenarioTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4">No scenario data available</td></tr>`;
        return;
    }

    rows.slice(0, 12).forEach((row) => {
        const tr = document.createElement("tr");

        const tempOut = row.temperature !== null && row.temperature !== undefined ? `${Math.round(Number(row.temperature))}°C` : "-";
        const prcpOut = row.precipitation !== null && row.precipitation !== undefined ? Number(row.precipitation).toFixed(2) : "-";
        const windOut = row.wind_speed !== null && row.wind_speed !== undefined ? Number(row.wind_speed).toFixed(2) : "-";
        const humOut = row.humidity !== null && row.humidity !== undefined ? `${Math.round(Number(row.humidity))}%` : "-";
        const hourOut = row.hour !== null && row.hour !== undefined ? String(row.hour) : "-";
        const weekdayOut = row.weekday || "-";
        const holidayOut = row.is_holiday ? "Yes" : "No";

        tr.innerHTML = `
            <td>${formatDateTime(row.datetime)}</td>
            <td>${formatNumber(row.scenario)} MWh</td>
            <td>${tempOut}</td>
            <td>${prcpOut}</td>
            <td>${windOut}</td>
            <td>${humOut}</td>
            <td>${hourOut}</td>
            <td>${weekdayOut}</td>
            <td>${holidayOut}</td>
            <td>${renderStatusBadge(row.status)}</td>
            <td>${renderRiskBadge(row.risk_flag)}</td>
        `;

        tbody.appendChild(tr);
    });
}

function updateScenarioNarrative(data) {
    const el = document.getElementById("scenarioNarrative");
    if (!el) return;

    const summary = data.summary || {};
    const model = data.model_choice || "-";
    const horizon = data.horizon || 0;
    const risk = summary.risk_level || "Low";
    const peak = summary.scenario_peak != null ? `${formatNumber(summary.scenario_peak)} MWh` : "-";
    const avg = summary.scenario_avg != null ? `${formatNumber(summary.scenario_avg)} MWh` : "-";
    const minv = summary.scenario_min != null ? `${formatNumber(summary.scenario_min)} MWh` : "-";

    el.textContent = `Model: ${model}. Horizon: ${horizon}h. Peak: ${peak}, Average: ${avg}, Minimum: ${minv}. Operational risk is ${risk}.`; 
}

function bindRangeLabel(input, labelId, suffix, signed = false) {
    if (!input) return;

    const update = () => {
        const value = Number(input.value);
        const formatted = signed ? formatSigned(value) : value;
        setText(labelId, `${formatted}${suffix}`);
    };

    update();
    input.addEventListener("input", update);
}

function renderStatusBadge(status) {
    if (status === "Peak") return `<span class="badge-status-peak">Peak</span>`;
    if (status === "Low Load") return `<span class="badge-status-low">Low Load</span>`;
    return `<span class="badge-status-normal">${status ?? 'Normal'}</span>`;
}

function renderRiskBadge(risk) {
    if (risk === "High") return `<span class="badge text-bg-danger">High</span>`;
    if (risk === "Medium") return `<span class="badge text-bg-warning">Medium</span>`;
    return `<span class="badge bg-light text-dark border">Low</span>`;
}

function formatSigned(value) {
    if (value > 0) return `+${value}`;
    return `${value}`;
}

function formatNumber(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
    return Number(value).toLocaleString();
}

function formatDateTime(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:00`;
}

function formatHourLabel(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value) {
    return String(value).padStart(2, "0");
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setHTML(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
}

function setLoadingState(isLoading) {
    const refreshBtn = document.getElementById("refreshDashboardBtn");
    if (!refreshBtn) return;

    refreshBtn.disabled = isLoading;
    refreshBtn.innerHTML = isLoading
        ? `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading`
        : `<i class="bi bi-arrow-clockwise"></i> Refresh`;
}

document.addEventListener("DOMContentLoaded", function () {
    setupPerformancePage();
});

function setupPerformancePage() {
    const metricsChart = document.getElementById("performanceMainChart");
    if (!metricsChart) return;

    // New performance template has its own dedicated inline loader.
    // Skip legacy loader to avoid conflicting API calls and null-control assumptions.
    if (!document.getElementById("metricsCitySelect") && !document.getElementById("metricsHorizonSelect")) {
        return;
    }

    const citySelect = document.getElementById("metricsCitySelect");
    const modelSelect = document.getElementById("metricsModelSelect");
    const horizonSelect = document.getElementById("metricsHorizonSelect");
    const refreshBtn = document.getElementById("refreshMetricsBtn");

    const loadMetrics = async () => {
        try {
            const city = citySelect ? citySelect.value : "Istanbul";
            const model = modelSelect ? modelSelect.value : "lstm";
            const horizon = horizonSelect ? horizonSelect.value : "24";

            const url = `${window.metricsConfig.metricsApiUrl}?city=${encodeURIComponent(city)}&model=${encodeURIComponent(model)}&horizon=${encodeURIComponent(horizon)}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error("Failed to fetch metrics API");
            }

            const data = await response.json();
            updateMetricsKpis(data);
            updateMetricsSummary(data);
            updateMetricsTable(data.samples || []);
            renderPerformanceMainChart(data.series || {});
            renderErrorDistributionChart(data.series || {});
            renderModelComparisonChart(data.comparison || []);
        } catch (error) {
            console.error("Metrics page load error:", error);
        }
    };

    if (refreshBtn) refreshBtn.addEventListener("click", loadMetrics);
    if (citySelect) citySelect.addEventListener("change", loadMetrics);
    if (modelSelect) modelSelect.addEventListener("change", loadMetrics);
    if (horizonSelect) horizonSelect.addEventListener("change", loadMetrics);

    loadMetrics();
}

function updateMetricsKpis(data) {
    const metrics = data.metrics || {};
    setText("metricMaeValue", `${metrics.mae ?? "-"}`);
    setText("metricRmseValue", `${metrics.rmse ?? "-"}`);
    setText("metricMapeValue", `${metrics.mape ?? "-"}%`);
    setText("metricR2Value", `${metrics.r2 ?? "-"}`);
}

function updateMetricsSummary(data) {
    const summary = data.summary || {};
    setText("bestModelValue", summary.best_model ?? "-");
    setText("peakErrorWindowValue", summary.peak_error_window ?? "-");
    setText("forecastStabilityValue", summary.forecast_stability ?? "-");
    setText("generalizationValue", summary.generalization_quality ?? "-");
    setText("recommendedUsageValue", summary.recommended_usage ?? "-");
}

function updateMetricsTable(rows) {
    const tbody = document.getElementById("metricsTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    rows.slice(0, 12).forEach((row) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${formatDateTime(row.datetime)}</td>
            <td>${formatNumber(row.actual)}</td>
            <td>${formatNumber(row.predicted)}</td>
            <td>${formatNumber(row.absolute_error)}</td>
            <td>${row.percentage_error}%</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderPerformanceMainChart(series) {
    const target = document.getElementById("performanceMainChart");
    if (!target || !window.Plotly) return;

    const actual = series.actual || [];
    const predicted = series.predicted || [];

    Plotly.newPlot(
        target,
        [
            {
                x: actual.map((item) => formatHourLabel(item.datetime)),
                y: actual.map((item) => item.value),
                type: "scatter",
                mode: "lines+markers",
                name: "Actual",
                line: { width: 3 }
            },
            {
                x: predicted.map((item) => formatHourLabel(item.datetime)),
                y: predicted.map((item) => item.value),
                type: "scatter",
                mode: "lines+markers",
                name: "Predicted",
                line: { width: 3, dash: "dash" }
            }
        ],
        {
            margin: { t: 10, r: 10, b: 45, l: 55 },
            paper_bgcolor: "white",
            plot_bgcolor: "white",
            legend: { orientation: "h" },
            xaxis: { title: "Time" },
            yaxis: { title: "Demand (MWh)" }
        },
        { responsive: true, displayModeBar: false }
    );
}

function renderErrorDistributionChart(series) {
    const target = document.getElementById("errorDistributionChart");
    if (!target || !window.Plotly) return;

    const residuals = series.residuals || [];

    Plotly.newPlot(
        target,
        [{
            x: residuals,
            type: "histogram",
            name: "Residuals"
        }],
        {
            margin: { t: 10, r: 10, b: 40, l: 50 },
            paper_bgcolor: "white",
            plot_bgcolor: "white",
            xaxis: { title: "Residual Error" },
            yaxis: { title: "Frequency" }
        },
        { responsive: true, displayModeBar: false }
    );
}

function renderModelComparisonChart(comparison) {
    const target = document.getElementById("modelComparisonChart");
    if (!target || !window.Plotly) return;

    Plotly.newPlot(
        target,
        [{
            x: comparison.map((item) => item.model),
            y: comparison.map((item) => item.mae),
            type: "bar",
            name: "MAE"
        }],
        {
            margin: { t: 10, r: 10, b: 40, l: 50 },
            paper_bgcolor: "white",
            plot_bgcolor: "white",
            xaxis: { title: "Model" },
            yaxis: { title: "MAE" }
        },
        { responsive: true, displayModeBar: false }
    );
}

function renderHistorical7Day(metricsData) {
    // metricsData.series.actual is an hourly series with datetime and value
    const actual = (metricsData.series && metricsData.series.actual) ? metricsData.series.actual : [];
    if (!actual.length) return;

    // Aggregate by weekday name (Mon, Tue, ...)
    const agg = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    actual.forEach((item) => {
        const d = new Date(item.datetime);
        if (Number.isNaN(d.getTime())) return;
        const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
        const label = dayNames[d.getDay()];
        agg[label] = (agg[label] || 0) + (Number(item.value) || 0);
    });

    const points = Object.keys(agg).map((k) => ({ day: k, demand: Math.round(agg[k]) }));
    renderWeeklyTrend(points);
}

function showForecastLoading() {
    const tbody = document.getElementById("forecastTableBody");
    if (!tbody) return;
    tbody.innerHTML = `
        <tr><td colspan="9" class="text-center py-4">Loading forecast, please wait...</td></tr>
    `;
}

function clearForecastLoading() {
    // no-op here; updateForecastTable will populate rows when ready
}

function showForecastError() {
    const tbody = document.getElementById("forecastTableBody");
    if (!tbody) return;
    tbody.innerHTML = `
        <tr><td colspan="9" class="text-center py-4 text-danger">Failed to load forecast. Try refresh.</td></tr>
    `;
}