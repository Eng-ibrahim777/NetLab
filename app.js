// ===================== Firebase (المصادقة + قاعدة البيانات) =====================
const firebaseConfig = {
    apiKey: "AIzaSyDDrgYOcbJAMs6dQZkyVVIVOhEFsH3Jcu4",
    authDomain: "windows-file-share.firebaseapp.com",
    projectId: "windows-file-share",
    storageBucket: "windows-file-share.firebasestorage.app",
    messagingSenderId: "664895545474",
    appId: "1:664895545474:web:bd4f75d9ee82342c9bd49b",
    measurementId: "G-LCTWVRZ4FG"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ===================== Supabase (تخزين الملفات) =====================
const SUPABASE_URL = 'https://dotmnnkjvbdtgcvfxlvi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NiwC_WTRL26JR2JO8abiMA_g3VwwQrF'; // Publishable key (آمن للاستخدام العلني)
const BUCKET = 'files';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (حد الخطة المجانية)
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function sbSafeName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function sbUpload(path, file, downloadName) {
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (error) throw error;
    const options = downloadName ? { download: downloadName } : undefined;
    return sb.storage.from(BUCKET).getPublicUrl(path, options).data.publicUrl;
}

async function sbDelete(path) {
    if (!path) return;
    const { error } = await sb.storage.from(BUCKET).remove([path]);
    if (error) throw error;
}

// تقدم رفع وهمي (Supabase لا يعطي نسبة التقدم الحقيقية)
function startFakeProgress(barEl) {
    let p = 5;
    barEl.style.width = p + '%';
    const timer = setInterval(() => {
        p = Math.min(p + Math.random() * 6, 90);
        barEl.style.width = p + '%';
    }, 400);
    return () => { clearInterval(timer); barEl.style.width = '100%'; };
}

// ===================== المتغيرات العامة =====================
let filesData = [];
let reportsData = [];
let categoriesData = [
    { key: 'tools', nameAr: 'أدوات النظام', nameEn: 'System Tools', icon: 'fa-tools', isCustom: false },
    { key: 'network', nameAr: 'الشبكات والاتصالات', nameEn: 'Networks & Comms', icon: 'fa-network-wired', isCustom: false },
    { key: 'drivers', nameAr: 'التعريفات (Drivers)', nameEn: 'Drivers', icon: 'fa-microchip', isCustom: false },
    { key: 'scripts', nameAr: 'السكربتات والبرمجيات', nameEn: 'Scripts & Apps', icon: 'fa-code', isCustom: false }
];
let currentCategory = 'all';
let currentUser = null;
let isAdmin = false;
let fileToDeleteId = null;
let currentDownloadingFile = null;
let currentLang = localStorage.getItem('site_lang') || 'ar';
let isLightMode = localStorage.getItem('site_theme') === 'light';

// نظام المؤثرات الصوتية التفاعلية مع حماية عدم التوقف (Safe Audio Context)
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    return audioCtx;
}

function playSound(type) {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        if (ctx.state !== 'running') return;

        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        const now = ctx.currentTime;

        if (type === 'welcome') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.6);
            gainNode.gain.setValueAtTime(0.15, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
            osc.start(now); osc.stop(now + 0.8);
        } else if (type === 'click') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(600, now);
            gainNode.gain.setValueAtTime(0.05, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now); osc.stop(now + 0.08);
        } else if (type === 'success') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(659.25, now + 0.1);
            osc.frequency.setValueAtTime(783.99, now + 0.2);
            gainNode.gain.setValueAtTime(0.1, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.start(now); osc.stop(now + 0.4);
        } else if (type === 'error') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.setValueAtTime(120, now + 0.15);
            gainNode.gain.setValueAtTime(0.12, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
        }
    } catch (e) {
        // تجاهل أخطاء تشغيل الصوت لمنع توقف السكربت
    }
}

// قاموس الترجمة الشامل
const translations = {
    ar: {
        pageTitle: "مستودع ملفات البرامج - Edition Edu",
        mainTitle: "مستودع البرامج والملفات",
        subTitle: "مخصص لأنظمة Windows | تصفح وتحميل سريع للشبكات ",
        uploadBtn: "رفع ملف جديد",
        logoutBtn: "خروج",
        adminLoginBtn: "لوحة المتحكم",
        reportsDashBtn: "البلاغات",
        dropText: "اسحب وأسقط الملفات هنا للرفع السريع على الويندوز",
        searchPlaceholder: "ابحث باسم البرنامج، الإضافة، أو وصف الملف...",
        catAll: "الكل",
        addCategoryBtnText: "إضافة قسم",
        delCategoryBtnText: "حذف قسم",
        modalCatTitle: "إضافة قسم جديد",
        modalDelCatTitle: "حذف قسم مخصص",
        catKeyLabel: "معرف القسم بالإنجليزية (مثل: security)",
        catNameArLabel: "اسم القسم بالعربية",
        catNameEnLabel: "اسم القسم بالإنجليزية",
        catIconLabel: "أيقونة FontAwesome (مثل: fa-shield-alt)",
        saveCatBtn: "حفظ وإضافة القسم",
        selectCatLabel: "اختر القسم المراد حذفه",
        confirmDeleteCatBtn: "حذف القسم نهائياً",
        modalAdminTitle: "دخول المسؤول",
        emailLabel: "البريد الإلكتروني",
        passLabel: "كلمة المرور",
        cancelBtn: "إلغاء",
        loginBtn: "تسجيل الدخول",
        fileLockTitle: "حماية الملف بكلمة سر",
        fileLockDesc: "هذا الملف محمي. أدخل كلمة السر الخاصة بتحميل:",
        passPlaceholder: "أدخل كلمة السر هنا...",
        verifyBtn: "تحقق ومتابعة",
        confirmDownloadTitle: "تأكيد التحميل",
        confirmDownloadDesc: "هل أنت متأكد من تحميل الملف:",
        proceedBtn: "تأكيد وبدء التحميل",
        deleteTitle: "تأكيد حذف الملف",
        deleteDesc: "هل أنت متأكد من رغبتك في حذف هذا الملف بشكل نهائي من السيرفر السحابي؟",
        confirmDeleteBtn: "حذف نهائي",
        uploadModalTitle: "رفع ملف جديد للويندوز",
        chooseFileLabel: "اختر الملف",
        filePickerText: "اضغط لاختيار ملف من جهازك",
        fileNameLabel: "اسم البرنامج / الملف",
        categoryLabel: "التصنيف",
        winVersionLabel: "إصدار الويندوز المتوافق",
        descLabel: "الوصف المختصر",
        descPlaceholder: "اكتب وصفاً قصيراً لمحتوى الملف وكيفية استخدامه...",
        uploadSubmitBtn: "رفع الملف الآن",
        downloadBtn: "تحميل",
        passCorrect: "✓ كلمة السر صحيحة! جاري الانتقال للتأكيد...",
        passIncorrect: "✕ كلمة السر غير صحيحة، حاول مجدداً!",
        reportModalTitle: "تقديم بلاغ / اقتراح / تطوير",
        reportTypeLabel: "نوع المشاركة",
        optProblem: "مشكلة أو خلل في الموقع",
        optSuggestion: "اقتراح أو فكرة جديدة",
        optImprovement: "طلب تطوير ميزة حالية",
        optOther: "ملاحظات أخرى",
        reportDescLabel: "التفاصيل والملاحظات",
        reportDescPlaceholder: "اشرح المشكلة أو الفكرة بالتفصيل...",
        reportFileLabel: "مرفق (صورة أو ملف توضيحي - اختياري)",
        reportFilePickText: "اضغط لإرفاق صورة/ملف توضيحي",
        sendReportBtn: "إرسال التقرير الآن",
        reportSuccess: "تم إرسال بلاغك/اقتراحك بنجاح! شكراً لك.",
        reportError: "حدث خطأ أثناء إرسال التقرير!",
        reportsDashTitle: "لوحة إشعارات وبلاغات المستخدمين",
        closeBtn: "إغلاق",
        noReportsText: "لا توجد بلاغات أو ملاحظات جديدة حتى الآن.",
        fileTooBig: "حجم الملف أكبر من 50MB (الحد المسموح).",
        fileTooBigReport: "حجم المرفق أكبر من 50MB (الحد المسموح)."
    },
    en: {
        pageTitle: "Files Software Repository - Edu Edition",
        mainTitle: "Software & Files Repository",
        subTitle: "Dedicated for Files | Fast Browsing & Secure Download",
        uploadBtn: "Upload New File",
        logoutBtn: "Logout",
        adminLoginBtn: "Account Admin",
        reportsDashBtn: "Reports",
        dropText: "Drag & Drop files here for fast Windows upload",
        searchPlaceholder: "Search by tool name, plugin, or description...",
        catAll: "All",
        addCategoryBtnText: "Add Category",
        delCategoryBtnText: "Delete Category",
        modalCatTitle: "Add New Category",
        modalDelCatTitle: "Delete Custom Category",
        catKeyLabel: "Category Key (e.g. security)",
        catNameArLabel: "Category Name (Arabic)",
        catNameEnLabel: "Category Name (English)",
        catIconLabel: "FontAwesome Icon (e.g. fa-shield-alt)",
        saveCatBtn: "Save & Add Category",
        selectCatLabel: "Select Category to Delete",
        confirmDeleteCatBtn: "Delete Category",
        modalAdminTitle: "Account Login",
        emailLabel: "Email Address",
        passLabel: "Password",
        cancelBtn: "Cancel",
        loginBtn: "Sign In",
        fileLockTitle: "File Password Protection",
        fileLockDesc: "This file is protected. Enter password to download:",
        passPlaceholder: "Enter password here...",
        verifyBtn: "Verify & Continue",
        confirmDownloadTitle: "Confirm Download",
        confirmDownloadDesc: "Are you sure you want to download:",
        proceedBtn: "Confirm & Download",
        deleteTitle: "Confirm File Deletion",
        deleteDesc: "Are you sure you want to permanently delete this file from cloud storage?",
        confirmDeleteBtn: "Delete Permanently",
        uploadModalTitle: "Upload New Windows File",
        chooseFileLabel: "Choose File",
        filePickerText: "Click to select file from device",
        fileNameLabel: "Tool / File Name",
        categoryLabel: "Category",
        winVersionLabel: "Compatible Windows",
        descLabel: "Short Description",
        descPlaceholder: "Write a short description...",
        uploadSubmitBtn: "Upload Now",
        downloadBtn: "Download",
        passCorrect: "✓ Correct password! Redirecting...",
        passIncorrect: "✕ Incorrect password, try again!",
        reportModalTitle: "Submit Report / Suggestion / Idea",
        reportTypeLabel: "Category",
        optProblem: "Bug / Problem in Site",
        optSuggestion: "New Feature Suggestion",
        optImprovement: "Improvement Request",
        optOther: "Other Feedback",
        reportDescLabel: "Details & Notes",
        reportDescPlaceholder: "Describe your bug or suggestion in detail...",
        reportFileLabel: "Attachment (Image/File - Optional)",
        reportFilePickText: "Click to attach screenshot/file",
        sendReportBtn: "Send Report Now",
        reportSuccess: "Report/Suggestion sent successfully! Thank you.",
        reportError: "Error submitting report!",
        reportsDashTitle: "User Reports & Notifications Dashboard",
        closeBtn: "Close",
        noReportsText: "No new reports or feedback yet.",
        fileTooBig: "File is larger than 50MB (the allowed limit).",
        fileTooBigReport: "Attachment is larger than 50MB (the allowed limit)."
    }
};

window.addEventListener('DOMContentLoaded', () => {
    applyLanguage(currentLang);
    applyThemeMode();
    listenToCloudFiles();
    listenToCloudCategories();
    listenToCloudReports();

    setTimeout(() => {
        const splash = document.getElementById('splashScreen');
        if (splash) splash.classList.add('fade-out');
    }, 1500);

    document.addEventListener('click', () => {
        playSound('click');
    }, { once: false, passive: true });

    const dropZone = document.getElementById('globalDropZone');
    if (dropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            if (!isAdmin) return;
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                toggleUploadModal(true);
                const fileInput = document.getElementById('fileInput');
                fileInput.files = files;
                updateFileNameDisplay(fileInput);
                document.getElementById('fileNameInput').value = files[0].name;
                playSound('success');
            }
        });
    }
});

// ===================== البلاغات =====================
function listenToCloudReports() {
    db.collection('site_reports').onSnapshot((snapshot) => {
        reportsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        updateReportsBadge();
    }, () => {
        reportsData = [];
        updateReportsBadge();
    });
}

function updateReportsBadge() {
    const badge = document.getElementById('reportsBadge');
    if (!badge) return;
    if (reportsData.length > 0 && isAdmin) {
        badge.style.display = 'inline-block';
        badge.textContent = reportsData.length;
    } else {
        badge.style.display = 'none';
    }
}

function openReportsDashboard() {
    if (!isAdmin) return;
    renderReportsList();
    document.getElementById('reportsDashboardModal').classList.add('active');
}

function toggleReportsDashboard(show) {
    document.getElementById('reportsDashboardModal').classList.toggle('active', show);
}

function handleReportsDashBackdropClick(e) {
    if (e.target.classList.contains('modal-backdrop')) toggleReportsDashboard(false);
}

function renderReportsList() {
    const container = document.getElementById('reportsListContainer');
    if (!container) return;
    container.innerHTML = '';

    if (reportsData.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 40px;"><i class="fas fa-check-circle" style="font-size: 2.5rem; color: var(--success-green); margin-bottom: 10px;"></i><p>${translations[currentLang].noReportsText}</p></div>`;
        return;
    }

    reportsData.forEach(rep => {
        const card = document.createElement('div');
        card.className = 'report-item-card';

        let typeLabel = rep.type;
        if (rep.type === 'problem') typeLabel = '⚠️ مشكلة / Bug';
        else if (rep.type === 'suggestion') typeLabel = '💡 اقتراح / Suggestion';
        else if (rep.type === 'improvement') typeLabel = '🚀 تطوير / Improvement';
        else typeLabel = '📌 ملاحظة أخرى / Other';

        const attachmentHtml = rep.attachmentUrl ? `
            <a href="${escapeHtml(rep.attachmentUrl)}" target="_blank" rel="noopener" class="report-attachment-link">
                <i class="fas fa-paperclip"></i> عرض المرفق (صورة/ملف)
            </a>
        ` : '<span style="color:var(--text-muted);">بدون مرفقات</span>';

        const dateStr = rep.createdAt && rep.createdAt.toDate ? rep.createdAt.toDate().toLocaleString() : 'منذ قليل';

        card.innerHTML = `
            <div class="report-item-header">
                <strong>${typeLabel}</strong>
                <span><i class="fas fa-user"></i> ${escapeHtml(rep.senderEmail)}</span>
            </div>
            <p class="report-item-desc">${escapeHtml(rep.description)}</p>
            <div class="report-item-footer">
                ${attachmentHtml}
                <div style="display: flex; gap: 10px; align-items: center;">
                    <span style="font-size: 0.75rem;"><i class="fas fa-clock"></i> ${dateStr}</span>
                    <button class="btn btn-danger-icon" onclick="deleteReport('${rep.id}')" title="حذف البلاغ">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

async function deleteReport(reportId) {
    if (!isAdmin) return;
    const rep = reportsData.find(r => r.id === reportId);
    try {
        if (rep && rep.storagePath) {
            await sbDelete(rep.storagePath).catch(() => {});
        }
        await db.collection('site_reports').doc(reportId).delete();
        playSound('success');
        showToast(currentLang === 'ar' ? 'تم حذف البلاغ بنجاح' : 'Report deleted successfully');
        renderReportsList();
    } catch (error) {
        playSound('error');
        showToast('خطأ أثناء الحذف: ' + error.message);
    }
}

// ===================== الأقسام =====================
function listenToCloudCategories() {
    db.collection('win_categories').onSnapshot((snapshot) => {
        let baseCategories = [
            { key: 'tools', nameAr: 'أدوات النظام', nameEn: 'System Tools', icon: 'fa-tools', isCustom: false },
            { key: 'network', nameAr: 'الشبكات والاتصالات', nameEn: 'Networks & Comms', icon: 'fa-network-wired', isCustom: false },
            { key: 'drivers', nameAr: 'التعريفات (Drivers)', nameEn: 'Drivers', icon: 'fa-microchip', isCustom: false },
            { key: 'scripts', nameAr: 'السكربتات والبرمجيات', nameEn: 'Scripts & Apps', icon: 'fa-code', isCustom: false }
        ];

        if (!snapshot.empty) {
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                baseCategories.push({ id: doc.id, ...data, isCustom: true });
            });
        }
        categoriesData = baseCategories;
        renderCategoriesUI();
        updateUploadCategoryDropdown();
        updateDeleteCategoryDropdown();
    });
}

function renderCategoriesUI() {
    const container = document.getElementById('categoryFilters');
    if (!container) return;

    container.innerHTML = `
        <button class="tag ${currentCategory === 'all' ? 'active' : ''}" data-cat="all" onclick="setCategory('all')">
            <i class="fas fa-border-all"></i> <span data-i18n="catAll">${translations[currentLang].catAll}</span>
        </button>
    `;

    categoriesData.forEach(cat => {
        const displayName = currentLang === 'ar' ? cat.nameAr : cat.nameEn;
        const isActive = currentCategory === cat.key ? 'active' : '';
        const btn = document.createElement('button');
        btn.className = `tag ${isActive}`;
        btn.dataset.cat = cat.key;
        btn.setAttribute('onclick', `setCategory('${cat.key}')`);
        btn.innerHTML = `<i class="fas ${cat.icon || 'fa-folder'}"></i> <span>${escapeHtml(displayName)}</span>`;
        container.appendChild(btn);
    });
}

function updateUploadCategoryDropdown() {
    const select = document.getElementById('fileCategoryInput');
    if (!select) return;
    select.innerHTML = '';
    categoriesData.forEach(cat => {
        const displayName = currentLang === 'ar' ? cat.nameAr : cat.nameEn;
        const opt = document.createElement('option');
        opt.value = cat.key;
        opt.textContent = displayName;
        select.appendChild(opt);
    });
}

function updateDeleteCategoryDropdown() {
    const select = document.getElementById('delCategorySelect');
    if (!select) return;
    select.innerHTML = '';
    const customCats = categoriesData.filter(c => c.isCustom);

    if (customCats.length === 0) {
        const opt = document.createElement('option');
        opt.value = "";
        opt.textContent = currentLang === 'ar' ? 'لا توجد أقسام مخصصة للحذف' : 'No custom categories to delete';
        select.appendChild(opt);
        return;
    }

    customCats.forEach(cat => {
        const displayName = currentLang === 'ar' ? cat.nameAr : cat.nameEn;
        const opt = document.createElement('option');
        opt.value = cat.key;
        opt.textContent = displayName;
        select.appendChild(opt);
    });
}

async function handleAddNewCategory(e) {
    e.preventDefault();
    if (!isAdmin) return;

    const key = document.getElementById('newCatKey').value.trim().toLowerCase();
    const nameAr = document.getElementById('newCatNameAr').value.trim();
    const nameEn = document.getElementById('newCatNameEn').value.trim();
    const icon = document.getElementById('newCatIcon').value.trim();

    if (!key || !nameAr || !nameEn) return;

    try {
        const newCat = { key, nameAr, nameEn, icon: icon || 'fa-folder' };
        await db.collection('win_categories').doc(key).set(newCat);

        playSound('success');
        showToast(currentLang === 'ar' ? 'تم إضافة القسم بنجاح!' : 'Category added successfully!');
        toggleAddCategoryModal(false);
        document.getElementById('addCategoryForm').reset();
    } catch (error) {
        playSound('error');
        showToast('خطأ بالسيرفر: ' + error.message);
    }
}

async function handleDeleteCategory(e) {
    e.preventDefault();
    if (!isAdmin) return;

    const select = document.getElementById('delCategorySelect');
    const catKey = select.value;
    if (!catKey) return;

    try {
        await db.collection('win_categories').doc(catKey).delete();
        playSound('success');
        showToast(currentLang === 'ar' ? 'تم حذف القسم بنجاح!' : 'Category deleted successfully!');
        toggleDeleteCategoryModal(false);
        if (currentCategory === catKey) setCategory('all');
    } catch (error) {
        playSound('error');
        showToast('خطأ أثناء الحذف: ' + error.message);
    }
}

// ===================== نافذة البلاغ =====================
function toggleReportModal(show) {
    document.getElementById('reportModal').classList.toggle('active', show);
}

function handleReportBackdropClick(e) {
    if (e.target.classList.contains('modal-backdrop')) toggleReportModal(false);
}

function updateReportFileNameDisplay(input) {
    const label = document.getElementById('reportFileLabelText');
    if (input.files.length > 0) {
        label.textContent = input.files[0].name;
        label.style.color = 'var(--accent-cyan)';
    } else {
        label.textContent = translations[currentLang].reportFilePickText;
        label.style.color = '';
    }
}

async function handleSendReport(e) {
    e.preventDefault();

    const type = document.getElementById('reportTypeInput').value;
    const desc = document.getElementById('reportDescInput').value;
    const fileInput = document.getElementById('reportFileInput');
    const attachmentFile = fileInput.files[0];

    const progressBarContainer = document.getElementById('reportProgressBarContainer');
    const progressBar = document.getElementById('reportProgressBar');
    const submitBtn = document.getElementById('sendReportSubmitBtn');

    if (attachmentFile && attachmentFile.size > MAX_FILE_SIZE) {
        playSound('error');
        showToast(translations[currentLang].fileTooBigReport);
        return;
    }

    submitBtn.disabled = true;
    progressBarContainer.style.display = 'block';

    let fileUrl = "";
    let storagePath = "";
    let stopProgress = null;

    try {
        if (attachmentFile) {
            storagePath = `user_reports/${Date.now()}_${sbSafeName(attachmentFile.name)}`;
            stopProgress = startFakeProgress(progressBar);
            fileUrl = await sbUpload(storagePath, attachmentFile);
            stopProgress();
            stopProgress = null;
        }

        await db.collection('site_reports').add({
            type: type,
            description: desc,
            attachmentUrl: fileUrl,
            storagePath: storagePath,
            senderEmail: currentUser ? currentUser.email : 'زائر (Guest)',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        playSound('success');
        showToast(translations[currentLang].reportSuccess);

        toggleReportModal(false);
        document.getElementById('reportForm').reset();
        document.getElementById('reportFileLabelText').textContent = translations[currentLang].reportFilePickText;
        document.getElementById('reportFileLabelText').style.color = '';

    } catch (error) {
        playSound('error');
        showToast(translations[currentLang].reportError + " (" + (error.message || error) + ")");
    } finally {
        if (stopProgress) stopProgress();
        submitBtn.disabled = false;
        progressBarContainer.style.display = 'none';
        progressBar.style.width = '0%';
    }
}

// ===================== نوافذ الأقسام =====================
function openAddCategoryModal() {
    if (!isAdmin) return;
    document.getElementById('addCategoryModal').classList.add('active');
}

function toggleAddCategoryModal(show) {
    document.getElementById('addCategoryModal').classList.toggle('active', show);
}

function handleAddCategoryBackdropClick(e) {
    if (e.target.classList.contains('modal-backdrop')) toggleAddCategoryModal(false);
}

function openDeleteCategoryModal() {
    if (!isAdmin) return;
    updateDeleteCategoryDropdown();
    document.getElementById('deleteCategoryModal').classList.add('active');
}

function toggleDeleteCategoryModal(show) {
    document.getElementById('deleteCategoryModal').classList.toggle('active', show);
}

function handleDeleteCategoryBackdropClick(e) {
    if (e.target.classList.contains('modal-backdrop')) toggleDeleteCategoryModal(false);
}

// ===================== اللغة والمظهر =====================
function toggleLanguage() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    localStorage.setItem('site_lang', currentLang);
    applyLanguage(currentLang);
    renderCategoriesUI();
    updateUploadCategoryDropdown();
    renderFiles();
}

function applyLanguage(lang) {
    const html = document.getElementById('htmlRoot');
    html.setAttribute('lang', lang);
    html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    document.getElementById('langBtnText').textContent = lang === 'ar' ? 'EN' : 'AR';

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang][key]) el.textContent = translations[lang][key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[lang][key]) el.placeholder = translations[lang][key];
    });
}

function toggleThemeMode() {
    isLightMode = !isLightMode;
    localStorage.setItem('site_theme', isLightMode ? 'light' : 'dark');
    applyThemeMode();
}

function applyThemeMode() {
    const body = document.body;
    const themeIcon = document.getElementById('themeIcon');
    if (isLightMode) {
        body.classList.add('light-mode');
        themeIcon.className = 'fas fa-moon';
    } else {
        body.classList.remove('light-mode');
        themeIcon.className = 'fas fa-adjust';
    }
}

// ===================== المصادقة =====================
auth.onAuthStateChanged((user) => {
    currentUser = user;
    isAdmin = !!user;
    if (user) {
        document.getElementById('adminUserEmail').textContent = user.email.split('@')[0];
    }
    updateAdminUI();
    renderFiles();
    updateReportsBadge();
});

// ===================== الملفات =====================
function listenToCloudFiles() {
    db.collection('win_files').onSnapshot((snapshot) => {
        filesData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        renderFiles();
    });
}

function renderFiles() {
    const grid = document.getElementById('filesGrid');
    if (!grid) return;
    const searchVal = document.getElementById('searchInput').value.toLowerCase();
    grid.innerHTML = '';

    const filtered = filesData.filter(file => {
        const matchesCategory = currentCategory === 'all' || file.category === currentCategory;
        const matchesSearch = (file.name || '').toLowerCase().includes(searchVal) || (file.desc || '').toLowerCase().includes(searchVal);
        return matchesCategory && matchesSearch;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 50px;"><i class="fas fa-folder-open" style="font-size: 3rem; margin-bottom: 10px; opacity:0.5;"></i><p>${currentLang === 'ar' ? 'لا توجد ملفات مطابقة...' : 'No matching files found...'}</p></div>`;
        return;
    }

    filtered.forEach((file) => {
        const card = document.createElement('div');
        card.className = 'file-card';

        const deleteBtnHtml = isAdmin ? `
            <button class="btn btn-danger-icon" onclick="openDeleteModal('${file.id}')" title="Delete">
                <i class="fas fa-trash-alt"></i>
            </button>
        ` : '';

        const dlText = translations[currentLang].downloadBtn;

        card.innerHTML = `
            <div>
                <div class="file-card-header">
                    <div class="file-icon-wrapper">
                        <i class="fas ${getFileIcon(file.category)} file-icon"></i>
                    </div>
                    <div class="file-info">
                        <h3>${escapeHtml(file.name)}</h3>
                        <span class="file-badge">${escapeHtml(file.version)}</span>
                    </div>
                </div>
                <p class="file-desc">${escapeHtml(file.desc)}</p>
            </div>
            <div>
                <div class="file-meta">
                    <span><i class="fas fa-hdd"></i> ${escapeHtml(file.size)}</span>
                    <span><i class="fas fa-download"></i> ${file.downloads || 0}</span>
                </div>
                <div class="card-actions">
                    <button onclick="initiateDownloadProcess('${file.id}')" class="btn btn-primary">
                        <i class="fas fa-download"></i> ${dlText}
                    </button>
                    ${deleteBtnHtml}
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    updateAdminUI();
}

function updateAdminUI() {
    const adminHeaderAction = document.getElementById('adminHeaderAction');
    const guestHeaderAction = document.getElementById('guestHeaderAction');
    const dropZone = document.getElementById('globalDropZone');
    const adminCategoryActions = document.getElementById('adminCategoryActions');

    if (isAdmin) {
        if (adminHeaderAction) adminHeaderAction.style.display = 'flex';
        if (guestHeaderAction) guestHeaderAction.style.display = 'none';
        if (dropZone) dropZone.style.display = 'block';
        if (adminCategoryActions) adminCategoryActions.style.display = 'flex';
    } else {
        if (adminHeaderAction) adminHeaderAction.style.display = 'none';
        if (guestHeaderAction) guestHeaderAction.style.display = 'flex';
        if (dropZone) dropZone.style.display = 'none';
        if (adminCategoryActions) adminCategoryActions.style.display = 'none';
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const email = document.getElementById('adminEmailInput').value;
    const password = document.getElementById('adminPasswordInput').value;
    try {
        await auth.signInWithEmailAndPassword(email, password);
        playSound('success');
        showToast(currentLang === 'ar' ? 'تم تسجيل الدخول بنجاح!' : 'Logged in successfully!');
        toggleAuthModal(false);
        document.getElementById('authForm').reset();
    } catch (error) {
        playSound('error');
        showToast(currentLang === 'ar' ? 'خطأ في البريد أو كلمة المرور!' : 'Invalid credentials!');
    }
}

async function handleAdminLogout() {
    await auth.signOut();
    playSound('click');
    showToast(currentLang === 'ar' ? 'تم تسجيل الخروج.' : 'Logged out.');
}

// ===================== رفع الملفات (Supabase + Firestore - تم إصلاح المشكلة هنا) =====================
async function handleUpload(e) {
    e.preventDefault();
    if (!isAdmin) return;

    const fileInput = document.getElementById('fileInput');
    const uploadedFile = fileInput.files[0];
    if (!uploadedFile) {
        showToast(currentLang === 'ar' ? 'الرجاء اختيار ملف أولاً!' : 'Please choose a file first!');
        return;
    }
    if (uploadedFile.size > MAX_FILE_SIZE) {
        playSound('error');
        showToast(translations[currentLang].fileTooBig);
        return;
    }

    const progressBarContainer = document.getElementById('progressBarContainer');
    const progressBar = document.getElementById('progressBar');
    const submitBtn = document.getElementById('submitBtn');

    progressBarContainer.style.display = 'block';
    submitBtn.disabled = true;

    let stopProgress = null;
    let storagePath = '';

    try {
        storagePath = `windows_files/${Date.now()}_${sbSafeName(uploadedFile.name)}`;
        stopProgress = startFakeProgress(progressBar);
        const downloadURL = await sbUpload(storagePath, uploadedFile, uploadedFile.name);
        stopProgress();
        stopProgress = null;

        const sizeInMB = (uploadedFile.size / (1024 * 1024)).toFixed(2) + ' MB';
        
        // جلب كلمة السر من الحقل الجديد المضاف في النافذة بدلاً من prompt المحظورة
        const passModalEl = document.getElementById('filePasswordInputModal');
        const filePassword = (passModalEl && passModalEl.value.trim()) ? passModalEl.value.trim() : '1234';

        await db.collection('win_files').add({
            name: document.getElementById('fileNameInput').value,
            category: document.getElementById('fileCategoryInput').value,
            version: document.getElementById('fileVerInput').value || 'Win 10/11',
            size: sizeInMB,
            desc: document.getElementById('fileDescInput').value,
            downloads: 0,
            url: downloadURL,
            storagePath: storagePath,
            password: filePassword,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        toggleUploadModal(false);
        document.getElementById('uploadForm').reset();
        document.getElementById('filePickerLabel').textContent = translations[currentLang].filePickerText;
        document.getElementById('filePickerLabel').style.color = '';
        playSound('success');
        showToast(currentLang === 'ar' ? 'تم رفع الملف بنجاح!' : 'File uploaded successfully!');
    } catch (err) {
        if (storagePath) { sbDelete(storagePath).catch(() => {}); }
        playSound('error');
        showToast((currentLang === 'ar' ? 'خطأ في الرفع: ' : 'Upload error: ') + (err.message || err));
    } finally {
        if (stopProgress) stopProgress();
        submitBtn.disabled = false;
        progressBarContainer.style.display = 'none';
        progressBar.style.width = '0%';
    }
}

// ===================== التحميل =====================
function initiateDownloadProcess(id) {
    const file = filesData.find(f => f.id === id);
    if (!file) return;

    currentDownloadingFile = file;
    document.getElementById('targetFileTitle').textContent = file.name;
    document.getElementById('filePasswordInput').value = '';
    document.getElementById('passwordFeedback').textContent = '';
    document.getElementById('passwordFeedback').className = 'password-feedback';
    togglePasswordModal(true);
}

function togglePasswordModal(show) {
    document.getElementById('passwordModal').classList.toggle('active', show);
    if (show) setTimeout(() => document.getElementById('filePasswordInput').focus(), 100);
}

function handlePasswordBackdropClick(e) {
    if (e.target.classList.contains('modal-backdrop')) togglePasswordModal(false);
}

function handleVerifyPassword(e) {
    e.preventDefault();
    const enteredPass = document.getElementById('filePasswordInput').value;
    const targetPassword = currentDownloadingFile.password || '1234';
    const feedback = document.getElementById('passwordFeedback');

    if (enteredPass === targetPassword) {
        playSound('success');
        feedback.textContent = translations[currentLang].passCorrect;
        feedback.className = 'password-feedback success';

        setTimeout(() => {
            togglePasswordModal(false);
            document.getElementById('finalDownloadFileName').textContent = currentDownloadingFile.name;
            toggleConfirmDownloadModal(true);
        }, 800);
    } else {
        playSound('error');
        feedback.textContent = translations[currentLang].passIncorrect;
        feedback.className = 'password-feedback error';
        document.getElementById('filePasswordInput').value = '';
    }
}

function toggleConfirmDownloadModal(show) {
    document.getElementById('confirmDownloadModal').classList.toggle('active', show);
}

function handleConfirmDownloadBackdropClick(e) {
    if (e.target.classList.contains('modal-backdrop')) toggleConfirmDownloadModal(false);
}

document.getElementById('proceedDownloadBtn')?.addEventListener('click', () => {
    if (!currentDownloadingFile) return;
    const file = currentDownloadingFile;
    toggleConfirmDownloadModal(false);

    db.collection('win_files').doc(file.id).update({
        downloads: firebase.firestore.FieldValue.increment(1)
    }).catch(() => {});

    playSound('success');
    showToast(currentLang === 'ar' ? `جاري تحميل ${file.name}...` : `Downloading ${file.name}...`);

    const a = document.createElement('a');
    a.href = file.url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    currentDownloadingFile = null;
});

// ===================== حذف الملفات =====================
document.getElementById('confirmDeleteBtn')?.addEventListener('click', async () => {
    if (!fileToDeleteId || !isAdmin) return;
    const file = filesData.find(f => f.id === fileToDeleteId);
    if (file) {
        try {
            if (file.storagePath) await sbDelete(file.storagePath).catch(() => {});
            await db.collection('win_files').doc(fileToDeleteId).delete();
            playSound('success');
            showToast(currentLang === 'ar' ? 'تم الحذف بنجاح' : 'Deleted successfully');
        } catch (err) {
            playSound('error');
            showToast('Delete Error!');
        }
    }
    toggleDeleteModal(false);
});

function openDeleteModal(id) {
    if (!isAdmin) return;
    const file = filesData.find(f => f.id === id);
    if (!file) return;
    fileToDeleteId = id;
    document.getElementById('deleteFileNameTarget').textContent = file.name;
    toggleDeleteModal(true);
}

function toggleDeleteModal(show) {
    document.getElementById('deleteModal').classList.toggle('active', show);
    if (!show) fileToDeleteId = null;
}

function handleDeleteBackdropClick(e) {
    if (e.target.classList.contains('modal-backdrop')) toggleDeleteModal(false);
}

// ===================== نوافذ عامة =====================
function openAdminAuthModal() {
    document.getElementById('authModal').classList.add('active');
}

function toggleAuthModal(show) {
    document.getElementById('authModal').classList.toggle('active', show);
}

function handleAuthBackdropClick(e) {
    if (e.target.classList.contains('modal-backdrop')) toggleAuthModal(false);
}

function getFileIcon(category) {
    const found = categoriesData.find(c => c.key === category);
    return found ? found.icon : 'fa-tools';
}

function setCategory(cat) {
    currentCategory = cat;
    renderCategoriesUI();
    renderFiles();
}

function filterFiles() {
    renderFiles();
}

function toggleUploadModal(show) {
    if (!isAdmin) return;
    document.getElementById('uploadModal').classList.toggle('active', show);
}

function handleBackdropClick(e) {
    if (e.target.classList.contains('modal-backdrop')) toggleUploadModal(false);
}

function updateFileNameDisplay(input) {
    const label = document.getElementById('filePickerLabel');
    if (input.files.length > 0) {
        label.textContent = input.files[0].name;
        label.style.color = 'var(--accent-cyan)';
    }
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    document.getElementById('toastMessage').textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
}

function escapeHtml(str) {
    return str ? String(str).replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    }) : '';
}