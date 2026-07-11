// ============================================================
// admin-app.js
// منطق لوحة تحكم الأدمن: شاشة دخول بكلمة مرور، ثم جلب كل
// الإجابات من Firestore وعرضها كإحصائيات ورسوم بيانية،
// مع إمكانية تصدير البيانات إلى CSV.
// ============================================================

(function () {
  const app = document.getElementById("app");
  const SESSION_KEY = "survey_admin_authed";

  const state = {
    authed: sessionStorage.getItem(SESSION_KEY) === "1",
    loading: false,
    responses: [],
    charts: [] // مراجع Chart.js لتدميرها عند إعادة الرسم
  };

  function render() {
    if (!state.authed) return renderLogin();
    return renderDashboard();
  }

  /* ---------------------- شاشة الدخول ---------------------- */
  function renderLogin() {
    app.innerHTML = `
      <div class="login-wrap">
        <form class="login-card" id="loginForm">
          <div class="login-icon">🔒</div>
          <h2 class="login-title">لوحة تحكم الباحث</h2>
          <p class="login-sub">أدخل كلمة المرور للوصول إلى النتائج</p>
          <div class="pw-wrap">
            <input type="password" class="pw-input" id="pwInput" placeholder="كلمة المرور" autofocus>
            <button type="button" class="pw-toggle" id="pwToggle">👁</button>
          </div>
          <div id="loginError"></div>
          <button type="submit" class="btn btn-primary login-submit" style="width:100%;justify-content:center">دخول</button>
          <button type="button" class="login-back" id="backBtn">العودة إلى الاستبيان</button>
        </form>
      </div>
    `;

    const pwInput = document.getElementById("pwInput");
    const pwToggle = document.getElementById("pwToggle");
    pwToggle.addEventListener("click", () => {
      pwInput.type = pwInput.type === "password" ? "text" : "password";
    });

    document.getElementById("loginForm").addEventListener("submit", e => {
      e.preventDefault();
      if (pwInput.value === ADMIN_PASSWORD) {
        state.authed = true;
        sessionStorage.setItem(SESSION_KEY, "1");
        render();
      } else {
        document.getElementById("loginError").innerHTML = `<p class="login-error">كلمة المرور غير صحيحة</p>`;
      }
    });

    document.getElementById("backBtn").addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  /* ---------------------- لوحة التحكم ---------------------- */
  function renderDashboard() {
    app.innerHTML = `
      <div class="dash-body">
        <header class="dash-header">
          <div class="dash-header-inner">
            <div class="dash-brand">
              <div class="dash-logo">📊</div>
              <div>
                <p class="dash-title">لوحة تحكم الباحث</p>
                <p class="dash-sub">تحليل نتائج الاستبانة لحظياً</p>
              </div>
            </div>
            <div class="dash-actions">
              <button class="dash-btn" id="refreshBtn">↻ تحديث</button>
              <button class="dash-btn" id="exportBtn">⬇ تصدير CSV</button>
              <button class="dash-btn dash-btn-primary" id="logoutBtn" style="background:#57534e;border-color:#57534e">🚪 خروج</button>
            </div>
          </div>
        </header>
        <main class="dash-main" id="dashMain">
          <div class="loading-state">جارِ تحميل البيانات...</div>
        </main>
      </div>
    `;

    document.getElementById("refreshBtn").addEventListener("click", loadData);
    document.getElementById("exportBtn").addEventListener("click", exportCSV);
    document.getElementById("logoutBtn").addEventListener("click", () => {
      sessionStorage.removeItem(SESSION_KEY);
      state.authed = false;
      render();
    });

    loadData();
  }

  async function loadData() {
    const main = document.getElementById("dashMain");
    if (main) main.innerHTML = `<div class="loading-state">جارِ تحميل البيانات...</div>`;
    try {
      const snap = await db.collection(RESPONSES_COLLECTION).get();
      state.responses = snap.docs.map(d => d.data());
    } catch (e) {
      console.error(e);
      if (main) {
        main.innerHTML = `<div class="config-warning">
          تعذّر الاتصال بقاعدة البيانات. تأكد من ضبط بيانات Firebase بشكل صحيح في ملف
          <code>js/firebase-config.js</code>، ومن أن قواعد Firestore تسمح بالقراءة.
        </div>`;
      }
      return;
    }
    renderStats();
  }

  function renderStats() {
    const main = document.getElementById("dashMain");
    const n = state.responses.length;

    if (n === 0) {
      main.innerHTML = `
        <div class="empty-state">
          <div class="icon">👥</div>
          <h3>لا توجد إجابات بعد</h3>
          <p>ستظهر النتائج والرسوم البيانية هنا فور استلام أول إجابة على الاستبانة.</p>
        </div>
      `;
      return;
    }

    const countBy = (field) => {
      const map = {};
      state.responses.forEach(r => {
        let v = (r.demo && r.demo[field]) || "غير محدد";
        if (field === "jobtitle" && v === "أخرى" && r.demo.jobtitle_other) v = `أخرى: ${r.demo.jobtitle_other}`;
        map[v] = (map[v] || 0) + 1;
      });
      return map;
    };

    const itemStats = ALL_ITEMS.map(it => {
      const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      let sum = 0, count = 0;
      state.responses.forEach(r => {
        const v = r.answers && r.answers[it.id];
        if (v) { dist[v]++; sum += v; count++; }
      });
      return { ...it, mean: count ? +(sum / count).toFixed(2) : 0, count, dist };
    });

    const dimStats = [];
    SURVEY.axes.forEach(axis => {
      axis.dimensions.forEach(dim => {
        const items = itemStats.filter(it => dim.items.some(i => i.id === it.id));
        const validItems = items.filter(it => it.count > 0);
        const mean = validItems.length ? +(validItems.reduce((s, it) => s + it.mean, 0) / validItems.length).toFixed(2) : 0;
        dimStats.push({ axisName: axis.name, name: dim.name || axis.name, mean });
      });
    });

    const axisStats = SURVEY.axes.map(axis => {
      const dims = dimStats.filter(d => d.axisName === axis.name);
      const mean = dims.length ? +(dims.reduce((s, d) => s + d.mean, 0) / dims.length).toFixed(2) : 0;
      return { name: axis.name, mean };
    });

    const lastSubmission = state.responses
      .map(r => r.submittedAt && r.submittedAt.toDate ? r.submittedAt.toDate() : null)
      .filter(Boolean)
      .sort((a, b) => b - a)[0];

    main.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">👥 عدد المستجيبين</div><div class="stat-value">${n}</div></div>
        <div class="stat-card"><div class="stat-label">🧩 محاور الدراسة</div><div class="stat-value">${SURVEY.axes.length}</div></div>
        <div class="stat-card"><div class="stat-label">📝 عدد العبارات</div><div class="stat-value">${ALL_ITEMS.length}</div></div>
        <div class="stat-card"><div class="stat-label">🕐 آخر إجابة</div><div class="stat-value" style="font-size:15px">${lastSubmission ? lastSubmission.toLocaleDateString("ar-EG") : "-"}</div></div>
      </div>

      <h2 class="section-heading">البيانات الشخصية للعينة</h2>
      <div class="chart-grid">
        <div class="chart-card"><h3>الجنس</h3><canvas id="chartGender" height="180"></canvas></div>
        <div class="chart-card"><h3>المؤهل العلمي</h3><canvas id="chartQual" height="180"></canvas></div>
        <div class="chart-card"><h3>المسمى الوظيفي</h3><canvas id="chartJob" height="180"></canvas></div>
        <div class="chart-card"><h3>سنوات الخبرة</h3><canvas id="chartExp" height="180"></canvas></div>
      </div>

      <h2 class="section-heading">المتوسط الحسابي لكل محور (من 5)</h2>
      <div class="chart-card"><canvas id="chartAxis" height="220"></canvas></div>

      <h2 class="section-heading">المتوسط الحسابي لكل بُعد</h2>
      <div class="chart-card"><canvas id="chartDims" height="${Math.max(220, dimStats.length * 34)}"></canvas></div>

      <h2 class="section-heading">تفصيل الإجابات لكل عبارة</h2>
      <div class="table-card">
        <div class="table-scroll">
          <table class="items-table">
            <thead>
              <tr>
                <th>م</th>
                <th>العبارة</th>
                <th>أوافق بشدة</th>
                <th>أوافق</th>
                <th>محايد</th>
                <th>لا أوافق</th>
                <th>لا أوافق بشدة</th>
                <th>المتوسط</th>
              </tr>
            </thead>
            <tbody>
              ${itemStats.map((it, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${it.text}</td>
                  <td>${it.dist[5]}</td>
                  <td>${it.dist[4]}</td>
                  <td>${it.dist[3]}</td>
                  <td>${it.dist[2]}</td>
                  <td>${it.dist[1]}</td>
                  <td class="mean-cell">${it.mean}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    drawCharts(countBy, axisStats, dimStats);
  }

  function drawCharts(countBy, axisStats, dimStats) {
    // تدمير الرسوم السابقة قبل إعادة الرسم
    state.charts.forEach(c => c.destroy());
    state.charts = [];

    const palette = ["#0f766e", "#14b8a6", "#5eead4", "#f59e0b", "#dc2626", "#78716c", "#a8a29e"];

    function makeBarChart(canvasId, dataMap) {
      const ctx = document.getElementById(canvasId);
      if (!ctx) return;
      const labels = Object.keys(dataMap);
      const values = Object.values(dataMap);
      const chart = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [{ data: values, backgroundColor: labels.map((_, i) => palette[i % palette.length]), borderRadius: 6 }]
        },
        options: {
          indexAxis: "y",
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
      state.charts.push(chart);
    }

    makeBarChart("chartGender", countBy("gender"));
    makeBarChart("chartQual", countBy("qualification"));
    makeBarChart("chartJob", countBy("jobtitle"));
    makeBarChart("chartExp", countBy("experience"));

    // رسم متوسط المحاور (radar)
    const axisCtx = document.getElementById("chartAxis");
    if (axisCtx) {
      const chart = new Chart(axisCtx, {
        type: "radar",
        data: {
          labels: axisStats.map(a => a.name),
          datasets: [{
            label: "المتوسط",
            data: axisStats.map(a => a.mean),
            backgroundColor: "rgba(15,118,110,0.25)",
            borderColor: "#0f766e",
            pointBackgroundColor: "#0f766e"
          }]
        },
        options: {
          scales: { r: { min: 0, max: 5, ticks: { stepSize: 1 } } },
          plugins: { legend: { display: false } }
        }
      });
      state.charts.push(chart);
    }

    // رسم متوسط الأبعاد
    const dimsCtx = document.getElementById("chartDims");
    if (dimsCtx) {
      const chart = new Chart(dimsCtx, {
        type: "bar",
        data: {
          labels: dimStats.map(d => d.name),
          datasets: [{ data: dimStats.map(d => d.mean), backgroundColor: "#14b8a6", borderRadius: 6 }]
        },
        options: {
          indexAxis: "y",
          plugins: { legend: { display: false } },
          scales: { x: { min: 0, max: 5 } }
        }
      });
      state.charts.push(chart);
    }
  }

  function exportCSV() {
    if (!state.responses.length) return;
    const headers = ["submittedAt", ...DEMO_FIELDS.map(f => f.id), ...ALL_ITEMS.map(it => it.id)];
    const rows = state.responses.map(r => {
      return headers.map(h => {
        if (h === "submittedAt") {
          const d = r.submittedAt && r.submittedAt.toDate ? r.submittedAt.toDate() : null;
          return d ? d.toISOString() : "";
        }
        if (DEMO_FIELDS.some(f => f.id === h)) return (r.demo && r.demo[h]) || "";
        return (r.answers && r.answers[h]) || "";
      }).map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `survey_responses_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  render();
})();
