// ============================================================
// survey-app.js
// منطق صفحة الاستبيان: عرض الأسئلة خطوة بخطوة، التحقق من
// الإجابات، ثم إرسالها إلى Firebase Firestore.
// ============================================================

(function () {
  const app = document.getElementById("app");

  // كل الأبعاد بترتيب واحد مع اسم المحور المرافق لها
  const flatDims = [];
  SURVEY.axes.forEach(axis => {
    axis.dimensions.forEach(dim => {
      flatDims.push({ ...dim, axisName: axis.name });
    });
  });

  // الحالة العامة للنموذج
  const state = {
    step: 0, // 0 = البيانات الشخصية، 1..N = الأبعاد
    demo: {},
    answers: {},
    submitting: false,
    submitted: false,
    error: ""
  };

  function render() {
    if (state.submitted) return renderSuccess();

    const totalSteps = TOTAL_STEPS;
    const pct = Math.round(((state.step + 1) / totalSteps) * 100);

    let html = `
      <div class="eyebrow-wrap" style="text-align:center">
        <span class="eyebrow">📋 استبانة دراسة علمية</span>
      </div>
      <h1 class="title">${SURVEY.title}</h1>
    `;

    if (state.step === 0) {
      html += `<div class="card intro-card">${SURVEY.intro}</div>`;
    }

    html += `
      <div class="progress-wrap">
        <div class="progress-labels">
          <span>الخطوة ${state.step + 1} من ${totalSteps}</span>
          <span>${pct}%</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="card" id="stepCard">
        ${state.step === 0 ? renderDemoStep() : renderDimStep(flatDims[state.step - 1])}
        ${state.error ? `<div class="error-box">${state.error}</div>` : ""}
        <div class="nav-row">
          <button class="btn btn-ghost" id="btnBack" ${state.step === 0 ? "disabled" : ""}>→ السابق</button>
          ${
            state.step < totalSteps - 1
              ? `<button class="btn btn-primary" id="btnNext">التالي ←</button>`
              : `<button class="btn btn-primary" id="btnSubmit" ${state.submitting ? "disabled" : ""}>${state.submitting ? "جارِ الإرسال..." : "إرسال الإجابات ✓"}</button>`
          }
        </div>
      </div>
      <div class="admin-link-wrap">
        <button class="admin-link" id="btnAdmin">⚙ لوحة تحكم الباحث</button>
      </div>
    `;

    app.innerHTML = html;
    attachEvents();
  }

  function renderDemoStep() {
    let html = `
      <h2 class="section-title">أولاً: البيانات الشخصية</h2>
      <p class="section-sub">هذه البيانات لأغراض التحليل الإحصائي فقط.</p>
    `;
    DEMO_FIELDS.forEach(field => {
      html += `<div class="field-block">
        <label class="field-label">${field.label}</label>
        <div class="chip-row" data-field="${field.id}">
          ${field.options.map(opt => `
            <button type="button" class="chip ${state.demo[field.id] === opt ? "active" : ""}" data-value="${escapeAttr(opt)}">${opt}</button>
          `).join("")}
        </div>
        ${field.id === "jobtitle" && state.demo.jobtitle === "أخرى" ? `
          <input type="text" class="other-input" id="jobtitleOther" placeholder="يرجى التحديد" value="${escapeAttr(state.demo.jobtitle_other || "")}">
        ` : ""}
      </div>`;
    });
    return html;
  }

  function renderDimStep(dim) {
    let html = `
      <p class="axis-label">${dim.axisName}</p>
      ${dim.name ? `<h2 class="section-title">${dim.name}</h2>` : ""}
      ${dim.note ? `<p class="dim-note">(${dim.note})</p>` : ""}
      <div style="margin-top:14px">
    `;
    dim.items.forEach(item => {
      const globalIndex = ALL_ITEMS.findIndex(x => x.id === item.id) + 1;
      const currentVal = state.answers[item.id];
      html += `
        <div class="likert-item">
          <div class="likert-head">
            <span class="likert-index">${globalIndex}</span>
            <p class="likert-text">${item.text}</p>
          </div>
          <div class="likert-options" data-item="${item.id}">
            ${SCALE.map(s => `
              <button type="button" class="likert-option ${currentVal === s.v ? "active" : ""}" data-value="${s.v}">${s.label}</button>
            `).join("")}
          </div>
        </div>
      `;
    });
    html += `</div>`;
    return html;
  }

  function renderSuccess() {
    app.innerHTML = `
      <div class="success-wrap">
        <div class="success-card">
          <div class="success-icon">✓</div>
          <h2 class="success-title">تم إرسال إجاباتك بنجاح</h2>
          <p class="success-text">نشكر لكم وقتكم وتعاونكم معنا. مساهمتكم ستدعم دقة نتائج هذه الدراسة العلمية.</p>
        </div>
      </div>
    `;
    document.body.style.background = "var(--stone-50)";
  }

  function attachEvents() {
    // اختيار البيانات الشخصية
    document.querySelectorAll(".chip-row").forEach(row => {
      row.addEventListener("click", e => {
        const btn = e.target.closest(".chip");
        if (!btn) return;
        const field = row.dataset.field;
        state.demo[field] = btn.dataset.value;
        state.error = "";
        render();
      });
    });

    const jobOther = document.getElementById("jobtitleOther");
    if (jobOther) {
      jobOther.addEventListener("input", e => {
        state.demo.jobtitle_other = e.target.value;
      });
    }

    // اختيار إجابات المقياس
    document.querySelectorAll(".likert-options").forEach(row => {
      row.addEventListener("click", e => {
        const btn = e.target.closest(".likert-option");
        if (!btn) return;
        const itemId = row.dataset.item;
        state.answers[itemId] = parseInt(btn.dataset.value, 10);
        state.error = "";
        render();
      });
    });

    const btnNext = document.getElementById("btnNext");
    if (btnNext) btnNext.addEventListener("click", goNext);

    const btnBack = document.getElementById("btnBack");
    if (btnBack) btnBack.addEventListener("click", goBack);

    const btnSubmit = document.getElementById("btnSubmit");
    if (btnSubmit) btnSubmit.addEventListener("click", submitSurvey);

    const btnAdmin = document.getElementById("btnAdmin");
    if (btnAdmin) btnAdmin.addEventListener("click", () => { window.location.href = "admin.html"; });
  }

  function validateDemo() {
    for (const f of DEMO_FIELDS) {
      if (!state.demo[f.id]) return `يرجى اختيار "${f.label}"`;
    }
    if (state.demo.jobtitle === "أخرى" && !(state.demo.jobtitle_other || "").trim()) {
      return "يرجى تحديد المسمى الوظيفي";
    }
    return "";
  }

  function validateDim(dim) {
    for (const it of dim.items) {
      if (!state.answers[it.id]) return "يرجى الإجابة عن جميع العبارات قبل المتابعة";
    }
    return "";
  }

  function goNext() {
    let err = "";
    if (state.step === 0) err = validateDemo();
    else err = validateDim(flatDims[state.step - 1]);

    if (err) { state.error = err; render(); return; }
    state.error = "";
    state.step += 1;
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }

  function goBack() {
    state.error = "";
    state.step = Math.max(0, state.step - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }

  async function submitSurvey() {
    const currentDim = flatDims[state.step - 1];
    const err = validateDim(currentDim);
    if (err) { state.error = err; render(); return; }

    state.submitting = true;
    state.error = "";
    render();

    try {
      const record = {
        submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        demo: state.demo,
        answers: state.answers
      };
      await db.collection(RESPONSES_COLLECTION).add(record);
      state.submitted = true;
      render();
    } catch (e) {
      console.error(e);
      state.error = "حدث خطأ أثناء إرسال إجاباتك. تحقق من الاتصال بالإنترنت وحاول مرة أخرى.";
      state.submitting = false;
      render();
    }
  }

  function escapeAttr(str) {
    return String(str).replace(/"/g, "&quot;");
  }

  render();
})();
