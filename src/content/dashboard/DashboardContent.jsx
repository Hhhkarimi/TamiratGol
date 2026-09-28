import React, { useEffect, useMemo, useState } from "react";

import {
  Chart,
  DataComponent,
  Dropdown,
  SegmentedControl,
  useDashboardTabs,
  useDataApp,
} from "../../data-app-public.jsx";
import "./dashboard.css";

const VERSION = "0.5.0";

const ROLE_OPTIONS = [
  { id: "maintenance", label: "مدیر کل تعمیرات", scope: "همه سایت‌ها", permissions: ["داشبورد", "هزینه", "تجهیزات", "خروجی"] },
  { id: "executive", label: "مدیر ارشد", scope: "گزارش تجمیعی", permissions: ["داشبورد", "هزینه", "مقایسه سایت‌ها"] },
  { id: "site-manager", label: "مدیر تعمیرات سایت", scope: "سایت تخصیص‌یافته", permissions: ["داشبورد", "هزینه", "تجهیزات"] },
  { id: "planner", label: "برنامه‌ریز تعمیرات", scope: "تجهیزات تخصیص‌یافته", permissions: ["داشبورد", "تجهیزات", "یادداشت"] },
  { id: "warehouse", label: "مسئول انبار", scope: "انبار تخصیص‌یافته", permissions: ["قطعات", "گردش کالا", "کیفیت داده"] },
  { id: "finance", label: "کارشناس مالی", scope: "همه مبالغ", permissions: ["داشبورد", "هزینه", "ویرایش نرخ"] },
  { id: "finance-manager", label: "مدیر مالی", scope: "همه مبالغ", permissions: ["داشبورد", "هزینه", "ویرایش نرخ", "تأیید نرخ"] },
  { id: "data-owner", label: "مالک داده", scope: "کل داده خام", permissions: ["کیفیت داده", "بارگذاری", "نگاشت"] },
  { id: "auditor", label: "حسابرس", scope: "کل سامانه", permissions: ["مشاهده", "سوابق تغییر"] },
  { id: "admin", label: "مدیر سامانه", scope: "تنظیمات فنی", permissions: ["کاربران", "نقش‌ها", "تنظیمات"] },
];

const number = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("fa-IR", { notation: "compact", maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("fa-IR", { style: "percent", maximumFractionDigits: 1 });

function sum(rows, field) {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
}

function aggregate(rows, key, fields) {
  const groups = new Map();
  rows.forEach((row) => {
    const groupKey = row[key] || "نامشخص";
    const current = groups.get(groupKey) || { [key]: groupKey };
    fields.forEach((field) => {
      current[field] = (current[field] || 0) + (Number(row[field]) || 0);
    });
    groups.set(groupKey, current);
  });
  return [...groups.values()];
}

function formatMoney(value, fxMode, canSeeFinancial) {
  if (!canSeeFinancial) return "محرمانه";
  if (!Number.isFinite(value)) return "—";
  return fxMode === "usd" ? `${number.format(value)} دلار` : compact.format(value);
}

function loadLocalState(key, fallback) {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function Metric({ label, value, note, tone = "neutral" }) {
  return (
    <div className="tg-metric" data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function EmptyRateNotice() {
  return (
    <div className="tg-empty" role="status">
      <strong>نرخ ارز هنوز ثبت نشده است.</strong>
      <span>در تب «دسترسی و ارز» نرخ هر سال را وارد کنید تا مقایسه دلاری فعال شود.</span>
    </div>
  );
}

function RankedList({ rows, labelField, valueField, fxMode, canSeeFinancial }) {
  const maximum = Math.max(1, ...rows.map((row) => Math.abs(Number(row[valueField]) || 0)));
  return (
    <ol className="tg-ranked" data-reviewed-rows>
      {rows.map((row, index) => {
        const value = Math.abs(Number(row[valueField]) || 0);
        return (
          <li key={`${row[labelField]}-${index}`}>
            <div className="tg-ranked-label">
              <span>{row[labelField]}</span>
              <strong>{formatMoney(value, fxMode, canSeeFinancial)}</strong>
            </div>
            <div className="tg-track" aria-hidden="true">
              <span style={{ width: `${Math.max(3, (value / maximum) * 100)}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function OverviewTab({ rates, fxMode, setFxMode, canSeeFinancial }) {
  const { reviewedRows, chartProps, chartOverrides } = useDataApp();
  const monthlyRows = reviewedRows("monthly_costs", ["period", "site"]);
  const centerRows = reviewedRows("cost_centers", ["center"]);
  const workTypeRows = reviewedRows("work_types", ["workType"]);
  const qualityRows = reviewedRows("data_quality", ["field"]);

  const totals = useMemo(() => ({
    amount: sum(monthlyRows, "amount"),
    absoluteAmount: sum(monthlyRows, "absoluteAmount"),
    records: sum(monthlyRows, "records"),
    issues: sum(monthlyRows, "issueRows"),
    returns: sum(monthlyRows, "returnRows"),
  }), [monthlyRows]);

  const chartRows = useMemo(() => monthlyRows.map((row) => {
    const rate = Number(rates[row.year]);
    return {
      ...row,
      displayValue: fxMode === "usd" ? (rate > 0 ? row.amount / rate : null) : row.amount,
    };
  }), [monthlyRows, rates, fxMode]);

  const missingRate = fxMode === "usd" && chartRows.some((row) => row.displayValue == null);
  const topCenters = useMemo(() => aggregate(centerRows, "center", ["amount", "absoluteAmount", "records"])
    .sort((left, right) => right.absoluteAmount - left.absoluteAmount)
    .slice(0, 8), [centerRows]);
  const typeSummary = useMemo(() => aggregate(workTypeRows, "workType", ["amount", "absoluteAmount", "records"])
    .sort((left, right) => right.records - left.records), [workTypeRows]);

  const trendSpec = chartOverrides["monthly-cost-trend"] ?? {
    type: "line",
    x: "period",
    y: "displayValue",
    series: "site",
    valueDecimals: 0,
    showLegend: true,
    showXAxisLabel: false,
    showYAxisLabel: false,
    ...(fxMode === "usd" ? { currency: "USD" } : {}),
  };
  const typeSpec = chartOverrides["work-type-composition"] ?? {
    type: "horizontalBar",
    x: "workType",
    y: "records",
    startAtZero: true,
    showXAxisLabel: false,
    showYAxisLabel: false,
  };

  return (
    <div className="tg-view tg-overview">
      <section className="tg-opening" aria-labelledby="overview-title">
        <div>
          <span className="tg-kicker">نمای عملیاتی</span>
          <h2 id="overview-title">هزینه، گردش قطعه و کیفیت ثبت</h2>
          <p>نمای اولیه بر پایه داده‌های تجمیعی سال‌های ۱۴۰۲ تا ۱۴۰۵ است. سال ۱۴۰۵ فقط تا ماه چهارم پوشش دارد.</p>
        </div>
        <SegmentedControl ariaLabel="واحد نمایش هزینه" value={fxMode} options={[
          { value: "nominal", label: "مبلغ اسمی" },
          { value: "usd", label: "معادل دلار" },
        ]} onChange={setFxMode} />
      </section>

      <DataComponent variant="plain" id="cost-summary" queryId="monthly_costs" kind="metric"
        title="خلاصه انتخاب فعلی" sourceRows={monthlyRows} displayRows={monthlyRows} className="tg-summary-strip">
        <div className="tg-metrics">
          <Metric label="مبلغ خالص ثبت‌شده" value={formatMoney(totals.amount, "nominal", canSeeFinancial)} note="جمع علامت‌دار مبالغ" />
          <Metric label="حجم گردش مالی" value={formatMoney(totals.absoluteAmount, "nominal", canSeeFinancial)} note="جمع قدرمطلق مبالغ" tone="accent" />
          <Metric label="تعداد ردیف" value={number.format(totals.records)} note="پس از اعمال فیلترها" />
          <Metric label="نسبت برگشت به گردش" value={totals.records ? percent.format(totals.returns / totals.records) : "—"} note={`${number.format(totals.issues)} مصرف · ${number.format(totals.returns)} برگشت`} tone="warning" />
        </div>
      </DataComponent>

      <div className="tg-primary-grid">
        <DataComponent variant="plain" id="monthly-cost-trend" queryId="monthly_costs" kind="chart"
          chart={trendSpec} title={fxMode === "usd" ? "روند مبلغ خالص به دلار همان سال" : "روند مبلغ خالص ثبت‌شده"}
          description="جمع ماهانه بر اساس سایت. مبالغ دلاری فقط با نرخ‌های واردشده در مرورگر محاسبه می‌شوند."
          sourceRows={monthlyRows} displayRows={chartRows} className="tg-chart-panel">
          {missingRate ? <EmptyRateNotice /> : <Chart spec={trendSpec} rows={chartRows} height={320} {...chartProps("monthly-cost-trend")} />}
        </DataComponent>

        <DataComponent variant="plain" id="top-cost-centers" queryId="cost_centers" kind="table"
          title="مراکز هزینه با بیشترین گردش" description="رتبه‌بندی بر اساس جمع قدرمطلق مبلغ، نه هزینه خالص."
          sourceRows={centerRows} displayRows={topCenters} className="tg-ranked-panel">
          <RankedList rows={topCenters} labelField="center" valueField="absoluteAmount" fxMode="nominal" canSeeFinancial={canSeeFinancial} />
        </DataComponent>
      </div>

      <div className="tg-secondary-grid">
        <DataComponent variant="plain" id="work-type-composition" queryId="work_types" kind="chart"
          chart={typeSpec} title="نوع دستورکار" description="تعداد ردیف‌های مرتبط با هر نوع دستورکار؛ رکوردهای نامشخص جدا نمایش داده می‌شوند."
          sourceRows={workTypeRows} displayRows={typeSummary} className="tg-chart-panel">
          <Chart spec={typeSpec} rows={typeSummary} height={270} {...chartProps("work-type-composition")} />
        </DataComponent>

        <DataComponent variant="plain" id="data-quality" queryId="data_quality" kind="table"
          title="کیفیت داده" description="نرخ خالی یا تکراری احتمالی در فایل منبع."
          sourceRows={qualityRows} displayRows={qualityRows} className="tg-quality-panel">
          <ul className="tg-quality" data-reviewed-rows>
            {qualityRows.map((row) => (
              <li key={row.field}>
                <span>{row.field}</span>
                <div className="tg-quality-value"><strong>{percent.format(row.missingRate)}</strong><small>{number.format(row.missing)} ردیف</small></div>
                <div className="tg-track" aria-hidden="true"><span style={{ width: `${Math.min(100, row.missingRate * 100)}%` }} /></div>
              </li>
            ))}
          </ul>
        </DataComponent>
      </div>
    </div>
  );
}

function EntityTable({ id, queryId, title, description, rows, columns, searchFields, canSeeFinancial }) {
  const [search, setSearch] = useState("");
  const normalized = search.trim().toLocaleLowerCase("fa-IR");
  const displayed = rows.filter((row) => !normalized || searchFields.some((field) => String(row[field] || "").toLocaleLowerCase("fa-IR").includes(normalized)))
    .sort((left, right) => right.absoluteAmount - left.absoluteAmount)
    .slice(0, 30);

  return (
    <DataComponent variant="plain" id={id} queryId={queryId} kind="table" title={title} description={description}
      sourceRows={rows} displayRows={displayed} className="tg-table-panel">
      <label className="tg-search">
        <span>جست‌وجو</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="کد یا نام را وارد کنید" />
      </label>
      <div className="tg-table-scroll">
        <table>
          <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>گردش مالی</th><th>ردیف</th></tr></thead>
          <tbody data-reviewed-rows>{displayed.map((row, index) => (
            <tr key={`${row[columns[0].key]}-${index}`}>
              {columns.map((column) => <td key={column.key}>{row[column.key] || "—"}</td>)}
              <td className="tg-numeric">{formatMoney(row.absoluteAmount, "nominal", canSeeFinancial)}</td>
              <td className="tg-numeric">{number.format(row.records)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </DataComponent>
  );
}

function AssetsTab({ canSeeFinancial }) {
  const { reviewedRows } = useDataApp();
  const assets = reviewedRows("assets", ["assetId"]);
  const items = reviewedRows("items", ["itemCode"]);
  return (
    <div className="tg-view">
      <section className="tg-opening">
        <div><span className="tg-kicker">کاوش جزئیات</span><h2>تجهیزات و قطعات اثرگذار</h2><p>جدول‌ها با فیلتر سال و سایت هماهنگ‌اند و تا ۳۰ نتیجه اول را نشان می‌دهند.</p></div>
      </section>
      <div className="tg-entity-grid">
        <EntityTable id="asset-register" queryId="assets" title="تجهیزات" description="تجهیزات مرتب‌شده بر اساس حجم گردش مالی قطعات."
          rows={assets} columns={[{ key: "assetId", label: "کد تجهیز" }, { key: "name", label: "نام" }, { key: "location", label: "موقعیت" }]}
          searchFields={["assetId", "name", "location"]} canSeeFinancial={canSeeFinancial} />
        <EntityTable id="item-register" queryId="items" title="قطعات" description="قطعات مرتب‌شده بر اساس حجم گردش مالی ثبت‌شده."
          rows={items} columns={[{ key: "itemCode", label: "کد کالا" }, { key: "description", label: "شرح" }, { key: "unit", label: "واحد" }]}
          searchFields={["itemCode", "description", "unit"]} canSeeFinancial={canSeeFinancial} />
      </div>
    </div>
  );
}

function RateEditor({ rates, setRates, activeRole }) {
  const canEdit = ["finance", "finance-manager"].includes(activeRole.id);
  const canApprove = activeRole.id === "finance-manager";
  const { reviewedRows } = useDataApp();
  const sourceRows = reviewedRows("exchange_rates", ["year"]);
  const monthlyRows = reviewedRows("monthly_costs", ["year"]);
  const annual = aggregate(monthlyRows, "year", ["amount", "absoluteAmount", "records"]).sort((a, b) => a.year.localeCompare(b.year));

  const updateRate = (year, rawValue) => {
    const value = rawValue === "" ? "" : Number(rawValue);
    const next = { ...rates, [year]: value };
    setRates(next);
    window.localStorage.setItem("tamiratgol.fx-rates", JSON.stringify(next));
  };

  return (
    <DataComponent variant="plain" id="exchange-rate-settings" queryId="exchange_rates" kind="table"
      title="نرخ ارز سالانه" description="نرخ‌ها در نسخه ۰.۵.۰ فقط در مرورگر کاربر ذخیره می‌شوند و هنوز گردش تأیید سمت سرور ندارند."
      sourceRows={sourceRows} displayRows={sourceRows} className="tg-rate-panel">
      <div className="tg-rate-status">
        <span data-tone={canEdit ? "active" : "locked"}>{canEdit ? "امکان ویرایش برای این نقش فعال است" : "این نقش فقط دسترسی مشاهده دارد"}</span>
        <span>{canApprove ? "مجوز تأیید نرخ" : "نرخ‌ها در وضعیت پیش‌نویس"}</span>
      </div>
      <div className="tg-table-scroll">
        <table>
          <thead><tr><th>سال</th><th>مبلغ خالص</th><th>نرخ هر دلار</th><th>معادل دلار</th><th>وضعیت</th></tr></thead>
          <tbody>{annual.map((row) => {
            const rate = Number(rates[row.year]);
            return (
              <tr key={row.year}>
                <td>{number.format(row.year)}</td>
                <td className="tg-numeric">{compact.format(row.amount)}</td>
                <td><input className="tg-rate-input" type="number" min="0" step="1" value={rates[row.year] ?? ""}
                  onChange={(event) => updateRate(row.year, event.target.value)} disabled={!canEdit} aria-label={`نرخ دلار سال ${row.year}`} placeholder="ثبت نشده" /></td>
                <td className="tg-numeric">{rate > 0 ? `${number.format(row.amount / rate)} دلار` : "—"}</td>
                <td><span className="tg-status">پیش‌نویس محلی</span></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </DataComponent>
  );
}

function AccessTab({ rates, setRates, activeRole }) {
  return (
    <div className="tg-view">
      <section className="tg-opening">
        <div><span className="tg-kicker">کنترل و حسابرسی</span><h2>نقش‌ها، محدوده و نرخ ارز</h2><p>شبیه‌ساز نقش نشان می‌دهد هر گروه در نسخه کامل چه محدوده‌ای خواهد داشت. احراز هویت واقعی در این MVP پیاده نشده است.</p></div>
      </section>
      <div className="tg-access-grid">
        <section className="tg-role-matrix" aria-labelledby="roles-title">
          <header><h3 id="roles-title">ماتریس دسترسی</h3><span>{ROLE_OPTIONS.length} نقش تعریف‌شده</span></header>
          <div className="tg-table-scroll">
            <table>
              <thead><tr><th>نقش</th><th>محدوده</th><th>مجوزهای کلیدی</th></tr></thead>
              <tbody>{ROLE_OPTIONS.map((role) => (
                <tr key={role.id} data-selected={role.id === activeRole.id}>
                  <td><strong>{role.label}</strong></td>
                  <td>{role.scope}</td>
                  <td><div className="tg-permissions">{role.permissions.map((permission) => <span key={permission}>{permission}</span>)}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
        <RateEditor rates={rates} setRates={setRates} activeRole={activeRole} />
      </div>
    </div>
  );
}

export function DashboardContent() {
  const tabs = [
    { id: "overview", label: "نمای کلی", filterIds: ["year", "site"] },
    { id: "assets", label: "تجهیزات و قطعات", filterIds: ["year", "site"] },
    { id: "access", label: "دسترسی و ارز", filterIds: ["year", "site"] },
  ];
  const { activeTabId } = useDashboardTabs(tabs);
  const { snapshot, filters, setFilter, queries } = useDataApp();
  const [fxMode, setFxMode] = useState("nominal");
  const [roleId, setRoleId] = useState(() => loadLocalState("tamiratgol.role", "maintenance"));
  const [rates, setRates] = useState(() => loadLocalState("tamiratgol.fx-rates", Object.fromEntries(queries.exchange_rates.rows.map((row) => [row.year, ""]))));

  const activeRole = ROLE_OPTIONS.find((role) => role.id === roleId) || ROLE_OPTIONS[0];
  const canSeeFinancial = activeRole.permissions.includes("هزینه");
  const years = ["all", ...new Set(queries.monthly_costs.rows.map((row) => row.year))];
  const sites = ["all", ...new Set(queries.monthly_costs.rows.map((row) => row.site))];

  useEffect(() => {
    window.localStorage.setItem("tamiratgol.role", JSON.stringify(roleId));
  }, [roleId]);

  return (
    <article className="page tg-page" dir="rtl">
      <header className="tg-app-head">
        <div className="tg-product-mark" aria-label="نسخه برنامه">
          <span>تعمیرات‌گل</span>
          <small>نسخه {VERSION}</small>
        </div>
        <div className="tg-head-controls">
          <Dropdown label="نقش فعال" showLabel value={roleId} choices={ROLE_OPTIONS.map((role) => role.id)}
            choiceLabels={Object.fromEntries(ROLE_OPTIONS.map((role) => [role.id, role.label]))} onChange={setRoleId} />
          <Dropdown label="سال" showLabel value={filters.year ?? "all"} choices={years}
            formatChoice={(value) => value === "all" ? "همه سال‌ها" : value} onChange={(value) => setFilter("year", value)} />
          <Dropdown label="سایت" showLabel value={filters.site ?? "all"} choices={sites}
            formatChoice={(value) => value === "all" ? "همه سایت‌ها" : value.replace("سایت کارخانه ", "")} onChange={(value) => setFilter("site", value)} />
        </div>
      </header>

      <div className="tg-context-line">
        <span>{activeRole.label}</span>
        <span>{activeRole.scope}</span>
        <span>{number.format(queries.monthly_costs.rows.reduce((total, row) => total + row.records, 0))} رکورد منبع</span>
        <span>به‌روزرسانی داده: {new Date(snapshot.generatedAt).toLocaleDateString("fa-IR")}</span>
      </div>

      {(!activeTabId || !["assets", "access"].includes(activeTabId)) && <OverviewTab rates={rates} fxMode={fxMode} setFxMode={setFxMode} canSeeFinancial={canSeeFinancial} />}
      {activeTabId === "assets" && <AssetsTab canSeeFinancial={canSeeFinancial} />}
      {activeTabId === "access" && <AccessTab rates={rates} setRates={setRates} activeRole={activeRole} />}
    </article>
  );
}
