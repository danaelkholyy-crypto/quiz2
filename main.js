const TICKETMASTER_KEY = "";
const pages = {
  "dashboard": { path: "/", title: "Dashboard", subtitle: "Welcome back! Ready to plan your next adventure?" },
  "holidays": { path: "/holidays", title: "Holidays", subtitle: "Explore public holidays around the world" },
  "events": { path: "/events", title: "Events", subtitle: "Find concerts, sports, and entertainment" },
  "weather": { path: "/weather", title: "Weather", subtitle: "Check forecasts for any destination" },
  "long-weekends": { path: "/long-weekends", title: "Long Weekends", subtitle: "Find the perfect mini-trip opportunities" },
  "currency": { path: "/currency", title: "Currency Converter", subtitle: "Convert currencies with live rates" },
  "sun-times": { path: "/sun-times", title: "Sun Times", subtitle: "Check sunrise and sunset times worldwide" },
  "my-plans": { path: "/plans", title: "My Plans", subtitle: "Your saved holidays and events" }
};

class Api {
  static async get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Request failed " + res.status);
    return await res.json();
  }

  static async post(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Request failed " + res.status);
    return await res.json();
  }
}

class PlansStorage {
  constructor() {
    this.key = "wanderlust-plans";
    this.items = JSON.parse(localStorage.getItem(this.key)) || [];
  }

  save() {
    localStorage.setItem(this.key, JSON.stringify(this.items));
  }

  has(id) {
    return this.items.some(p => p.id === id);
  }

  toggle(plan) {
    if (this.has(plan.id)) {
      this.remove(plan.id);
      return false;
    }
    this.items.push(plan);
    this.save();
    return true;
  }

  remove(id) {
    this.items = this.items.filter(p => p.id !== id);
    this.save();
  }

  clear() {
    this.items = [];
    this.save();
  }
}

const plans = new PlansStorage();
let selected = JSON.parse(localStorage.getItem("wanderlust-selected"));
let allCountries = [];
let pageItems = {};          
let clockTimer = null;
let currentFilter = "all";
let rates = null;
let ratesDate = "";

const $ = id => document.getElementById(id);

function showLoading(text) {
  $("loading-text").textContent = text || "Loading...";
  $("loading-overlay").classList.remove("hidden");
}

function hideLoading() {
  $("loading-overlay").classList.add("hidden");
}

function showToast(message, type) {
  const toast = document.createElement("div");
  toast.className = "toast " + (type || "info");
  toast.innerHTML = "<i class='fa-solid fa-circle-info'></i><span>" + message + "</span>";
  $("toast-container").appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function emptyState(icon, title, text) {
  return `<div class="empty-state">
    <div class="empty-icon"><i class="fa-solid ${icon}"></i></div>
    <h3>${title}</h3>
    <p>${text}</p>
  </div>`;
}

function noCountryState() {
  return emptyState("fa-earth-americas", "No country selected", "Go to the dashboard and choose a country first.");
}

function getCity() {
  return selected.city || selected.capital || selected.name;
}

function formatDate(dateString) {
  const d = new Date(dateString + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function saveSelected() {
  if (selected) localStorage.setItem("wanderlust-selected", JSON.stringify(selected));
  else localStorage.removeItem("wanderlust-selected");
}

function updatePlanCount() {
  const badge = $("plans-count");
  badge.textContent = plans.items.length;
  if (plans.items.length > 0) badge.classList.remove("hidden");
  else badge.classList.add("hidden");
  $("stat-saved").textContent = plans.items.length;
}

function updateClock() {
  const now = new Date();
  $("current-datetime").textContent = now.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function showPage(name, push) {
  if (!pages[name]) name = "dashboard";

  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  $(name + "-view").classList.add("active");

  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.view === name);
  });

  $("page-title").textContent = pages[name].title;
  $("page-subtitle").textContent = pages[name].subtitle;

  if (push) history.pushState({}, "", pages[name].path);

  updateHeaderBadges();
  closeSidebar();
  window.scrollTo(0, 0);

  if (name === "dashboard") loadDashboard();
  if (name === "holidays") loadHolidays();
  if (name === "events") loadEvents();
  if (name === "weather") loadWeather();
  if (name === "long-weekends") loadLongWeekends();
  if (name === "currency") loadCurrency();
  if (name === "sun-times") loadSunTimes();
  if (name === "my-plans") renderPlans();
}

function pageFromUrl() {
  const path = location.pathname.replace(/\/$/, "") || "/";
  for (const name in pages) {
    if (pages[name].path === path) return name;
  }
  return "dashboard";
}

function openSidebar() {
  $("sidebar").classList.add("open");
  $("sidebar-overlay").classList.remove("hidden");
  $("sidebar-overlay").classList.add("active");
}

function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("sidebar-overlay").classList.remove("active");
  $("sidebar-overlay").classList.add("hidden");
}

function updateHeaderBadges() {
  document.querySelectorAll(".view-header-selection").forEach(box => {
    box.style.display = "flex";
    if (!selected) {
      box.innerHTML = `<div class="no-selection-message">
        <i class="fa-solid fa-circle-info"></i><span>Choose a country from the dashboard</span></div>`;
      return;
    }
    const viewId = box.closest(".view").id;
    let extra = "";
    if (viewId === "holidays-view" || viewId === "long-weekends-view") {
      extra = `<span class="selection-year">${selected.year}</span>`;
    } else {
      extra = `<span class="selection-city">${getCity()}</span>`;
    }
    box.innerHTML = `<div class="current-selection-badge">
      <img src="${selected.flag}" class="selection-flag" alt="">
      <span>${selected.name}</span>${extra}</div>`;
  });
}

async function loadCountries() {
  let data = [];

  try {
    data = await Api.get("https://restcountries.com/v3.1/all?fields=name,cca2,flags,capital,latlng");
  } catch (err) {
    console.log("restcountries failed, trying the other api", err);

    const res = await Api.get("https://countriesnow.space/api/v0.1/countries/flag/images");
    data = res.data.map(item => {
      return {
        name: { common: item.name },
        cca2: item.iso2,
        flags: { png: "https://flagcdn.com/w80/" + item.iso2.toLowerCase() + ".png" },
        capital: []
      };
    });
  }

  allCountries = data.sort((a, b) => a.name.common.localeCompare(b.name.common));

  let options = '<option value="">Select Country</option>';
  allCountries.forEach(c => {
    options += `<option value="${c.cca2}">${c.name.common}</option>`;
  });
  $("global-country").innerHTML = options;
  $("stat-countries").textContent = allCountries.length > 90 ? "90+" : allCountries.length;
}

async function loadCities(countryName, selectedCity) {
  $("global-city").innerHTML = '<option value="">Loading cities...</option>';
  let options = '<option value="">Select City</option>';
  try {
    const data = await Api.post("https://countriesnow.space/api/v0.1/countries/cities", { country: countryName });
    data.data.forEach(city => {
      options += `<option value="${city}">${city}</option>`;
    });
  } catch (err) {
    console.log("cities error", err);
  }
  $("global-city").innerHTML = options;
  if (selectedCity) $("global-city").value = selectedCity;
}

function showSelectedBox() {
  const box = $("selected-destination");
  if (!selected) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  $("selected-country-flag").src = selected.flag;
  $("selected-country-name").textContent = selected.name;
  $("selected-city-name").textContent = selected.city ? "• " + selected.city : "";
}

async function onCountryChange() {
  const code = $("global-country").value;
  if (code === "") {
    clearSelection();
    return;
  }
  const country = allCountries.find(c => c.cca2 === code);
  selected = {
    code: code,
    name: country.name.common,
    flag: country.flags.png,
    capital: country.capital ? country.capital[0] : "",
    city: "",
    year: Number($("global-year").value),
    currency: ""
  };
  saveSelected();
  showSelectedBox();
  updateHeaderBadges();
  await loadCities(selected.name, "");
}

function onCityChange() {
  if (!selected) return;
  selected.city = $("global-city").value;
  saveSelected();
  showSelectedBox();
  updateHeaderBadges();
}

function onYearChange() {
  if (!selected) return;
  selected.year = Number($("global-year").value);
  saveSelected();
  updateHeaderBadges();
}

function clearSelection() {
  selected = null;
  saveSelected();
  $("global-country").value = "";
  $("global-city").innerHTML = '<option value="">Select City</option>';
  showSelectedBox();
  updateHeaderBadges();
  clearInterval(clockTimer);
  showCountryPlaceholder();
}

function showCountryPlaceholder() {
  $("dashboard-country-info").innerHTML = `<div class="country-info-placeholder">
    <div class="placeholder-icon"><i class="fa-solid fa-earth-americas"></i></div>
    <p>Select a country and press Explore to see its information</p></div>`;
}

async function onExplore() {
  if (!selected) {
    showToast("Please choose a country first", "error");
    return;
  }
  showLoading("Loading country info...");
  try {
    await loadCountryInfo();
    await updateHolidayStat();
  } catch (err) {
    showToast("Could not load country info", "error");
  }
  hideLoading();
}

async function loadCountryInfo() {
  const data = await Api.get("https://restcountries.com/v3.1/alpha/" + selected.code);
  const c = data[0];

  if (c.currencies) {
    selected.currency = Object.keys(c.currencies)[0];
    saveSelected();
  }

  let currencyTags = "";
  for (const code in c.currencies) {
    currencyTags += `<span class="extra-tag">${c.currencies[code].name} (${code} ${c.currencies[code].symbol || ""})</span>`;
  }
  let languageTags = "";
  for (const key in c.languages) {
    languageTags += `<span class="extra-tag">${c.languages[key]}</span>`;
  }
  let borderTags = "";
  if (c.borders && c.borders.length > 0) {
    c.borders.forEach(b => { borderTags += `<span class="extra-tag border-tag">${b}</span>`; });
  } else {
    borderTags = '<span class="extra-tag">No land borders</span>';
  }

  let callingCode = "";
  if (c.idd && c.idd.root) {
    callingCode = c.idd.root + (c.idd.suffixes && c.idd.suffixes.length === 1 ? c.idd.suffixes[0] : "");
  }
  const weekStart = c.startOfWeek ? c.startOfWeek.charAt(0).toUpperCase() + c.startOfWeek.slice(1) : "-";
  const timezone = c.timezones ? c.timezones[0] : "UTC";

  $("dashboard-country-info").innerHTML = `
    <div class="dashboard-country-header">
      <img src="${c.flags.png}" alt="" class="dashboard-country-flag">
      <div class="dashboard-country-title">
        <h3>${c.name.common}</h3>
        <p class="official-name">${c.name.official}</p>
        <span class="region"><i class="fa-solid fa-location-dot"></i> ${c.region}${c.subregion ? " • " + c.subregion : ""}</span>
      </div>
    </div>
    <div class="dashboard-local-time">
      <div class="local-time-display">
        <i class="fa-solid fa-clock"></i>
        <span class="local-time-value" id="country-local-time">--:--:--</span>
        <span class="local-time-zone">${timezone}</span>
      </div>
    </div>
    <div class="dashboard-country-grid">
      <div class="dashboard-country-detail"><i class="fa-solid fa-building-columns"></i><span class="label">Capital</span><span class="value">${c.capital ? c.capital[0] : "-"}</span></div>
      <div class="dashboard-country-detail"><i class="fa-solid fa-users"></i><span class="label">Population</span><span class="value">${c.population.toLocaleString()}</span></div>
      <div class="dashboard-country-detail"><i class="fa-solid fa-ruler-combined"></i><span class="label">Area</span><span class="value">${c.area.toLocaleString()} km²</span></div>
      <div class="dashboard-country-detail"><i class="fa-solid fa-globe"></i><span class="label">Continent</span><span class="value">${c.continents ? c.continents[0] : c.region}</span></div>
      <div class="dashboard-country-detail"><i class="fa-solid fa-phone"></i><span class="label">Calling Code</span><span class="value">${callingCode || "-"}</span></div>
      <div class="dashboard-country-detail"><i class="fa-solid fa-car"></i><span class="label">Driving Side</span><span class="value">${c.car && c.car.side ? c.car.side.charAt(0).toUpperCase() + c.car.side.slice(1) : "-"}</span></div>
      <div class="dashboard-country-detail"><i class="fa-solid fa-calendar-week"></i><span class="label">Week Starts</span><span class="value">${weekStart}</span></div>
    </div>
    <div class="dashboard-country-extras">
      <div class="dashboard-country-extra"><h4><i class="fa-solid fa-coins"></i> Currency</h4><div class="extra-tags">${currencyTags}</div></div>
      <div class="dashboard-country-extra"><h4><i class="fa-solid fa-language"></i> Languages</h4><div class="extra-tags">${languageTags}</div></div>
      <div class="dashboard-country-extra"><h4><i class="fa-solid fa-map-location-dot"></i> Neighbors</h4><div class="extra-tags">${borderTags}</div></div>
    </div>
    <div class="dashboard-country-actions">
      <a href="${c.maps.googleMaps}" target="_blank" class="btn-map-link"><i class="fa-solid fa-map"></i> View on Google Maps</a>
    </div>`;

  startLocalClock(timezone);
}

function startLocalClock(timezone) {
  clearInterval(clockTimer);
  let offset = 0;
  const match = timezone.match(/UTC([+-])(\d\d):(\d\d)/);
  if (match) {
    offset = (Number(match[2]) * 60 + Number(match[3])) * (match[1] === "-" ? -1 : 1);
  }
  function tick() {
    const el = $("country-local-time");
    if (!el) return;
    const shifted = new Date(Date.now() + offset * 60000);
    el.textContent = shifted.toLocaleTimeString("en-US", { timeZone: "UTC" });
  }
  tick();
  clockTimer = setInterval(tick, 1000);
}

async function updateHolidayStat() {
  if (!selected) return;
  try {
    const list = await Api.get(`https://date.nager.at/api/v3/PublicHolidays/${selected.year}/${selected.code}`);
    $("stat-holidays").textContent = list.length;
  } catch (err) {
    console.log(err);
  }
}

function loadDashboard() {
  updatePlanCount();
  updateHolidayStat();
}

function saveButton(id, className) {
  const saved = plans.has(id);
  return `<button class="${className} ${saved ? "saved" : ""}" data-save="${id}">
    <i class="fa-${saved ? "solid" : "regular"} fa-heart"></i></button>`;
}

function listenForSave(container) {
  container.onclick = function (e) {
    const btn = e.target.closest("[data-save]");
    if (!btn) return;
    const id = btn.dataset.save;
    const added = plans.toggle(pageItems[id]);

    container.querySelectorAll('[data-save="' + id + '"]').forEach(b => {
      b.classList.toggle("saved", added);
      const text = b.classList.contains("btn-event") ? (added ? " Saved" : " Save") : "";
      b.innerHTML = '<i class="fa-' + (added ? "solid" : "regular") + ' fa-heart"></i>' + text;
    });
    updatePlanCount();
    showToast(added ? "Added to My Plans" : "Removed from My Plans", added ? "success" : "info");
  };
}

async function loadHolidays() {
  const box = $("holidays-content");
  pageItems = {};
  if (!selected) {
    box.innerHTML = noCountryState();
    return;
  }
  showLoading("Loading holidays...");
  try {
    const list = await Api.get(`https://date.nager.at/api/v3/PublicHolidays/${selected.year}/${selected.code}`);
    let html = "";
    list.forEach(h => {
      const d = new Date(h.date + "T00:00:00");
      const id = "holiday-" + selected.code + "-" + h.date;
      pageItems[id] = { id: id, type: "holiday", title: h.localName, desc: h.name, date: h.date, endDate: "" };
      html += `<div class="holiday-card">
        <div class="holiday-card-header">
          <div class="holiday-date-box"><span class="day">${d.getDate()}</span><span class="month">${d.toLocaleDateString("en-US", { month: "short" })}</span></div>
          ${saveButton(id, "holiday-action-btn")}
        </div>
        <h3>${h.localName}</h3>
        <p class="holiday-name">${h.name}</p>
        <div class="holiday-card-footer">
          <span class="holiday-day-badge"><i class="fa-regular fa-calendar"></i> ${d.toLocaleDateString("en-US", { weekday: "long" })}</span>
          <span class="holiday-type-badge">${h.types ? h.types[0] : "Public"}</span>
        </div>
      </div>`;
    });
    box.innerHTML = html || emptyState("fa-calendar-xmark", "No holidays found", "Nothing found for this year.");
    listenForSave(box);
  } catch (err) {
    box.innerHTML = emptyState("fa-triangle-exclamation", "Something went wrong", "Could not load holidays, try again.");
  }
  hideLoading();
}

async function loadEvents() {
  const box = $("events-content");
  pageItems = {};
  if (!selected) {
    box.innerHTML = noCountryState();
    return;
  }
  if (TICKETMASTER_KEY === "") {
    box.innerHTML = emptyState("fa-ticket", "No Events Found", "No events found for this location");
    return;
  }
  showLoading("Loading events...");
  try {
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_KEY}&city=${encodeURIComponent(getCity())}&countryCode=${selected.code}&size=20`;
    const data = await Api.get(url);
    const list = data._embedded ? data._embedded.events : [];
    let html = "";
    list.forEach(ev => {
      const id = "event-" + ev.id;
      const venue = ev._embedded && ev._embedded.venues ? ev._embedded.venues[0].name : "";
      const date = ev.dates.start.localDate;
      const category = ev.classifications ? ev.classifications[0].segment.name : "Event";
      pageItems[id] = { id: id, type: "event", title: ev.name, desc: venue, date: date, endDate: "" };
      html += `<div class="event-card">
        <div class="event-card-image">
          <img src="${ev.images[0].url}" alt="">
          <span class="event-card-category">${category}</span>
          ${saveButton(id, "event-card-save")}
        </div>
        <div class="event-card-body">
          <h3>${ev.name}</h3>
          <div class="event-card-info">
            <div><i class="fa-regular fa-calendar"></i>${formatDate(date)}</div>
            <div><i class="fa-solid fa-location-dot"></i>${venue}</div>
          </div>
          <div class="event-card-footer">
            ${saveButton(id, "btn-event").replace("</button>", (plans.has(id) ? " Saved" : " Save") + "</button>")}
            <a href="${ev.url}" target="_blank" class="btn-buy-ticket"><i class="fa-solid fa-ticket"></i> Buy Tickets</a>
          </div>
        </div>
      </div>`;
    });
    box.innerHTML = html || emptyState("fa-ticket", "No Events Found", "No events found for this location");
    listenForSave(box);
  } catch (err) {
    box.innerHTML = emptyState("fa-ticket", "No Events Found", "No events found for this location");
  }
  hideLoading();
}

async function getPlace() {
  const url = "https://geocoding-api.open-meteo.com/v1/search?count=10&name=" + encodeURIComponent(getCity());
  const data = await Api.get(url);
  const list = data.results || [];
  if (list.length === 0) throw new Error("City not found");
  const sameCountry = list.find(p => p.country_code === selected.code);
  return sameCountry || list[0];
}

function weatherInfo(code) {
  if (code === 0) return { icon: "fa-sun", text: "Clear sky", cls: "weather-sunny" };
  if (code <= 2) return { icon: "fa-cloud-sun", text: "Partly cloudy", cls: "weather-sunny" };
  if (code === 3) return { icon: "fa-cloud", text: "Overcast", cls: "weather-cloudy" };
  if (code <= 48) return { icon: "fa-smog", text: "Foggy", cls: "weather-foggy" };
  if (code <= 67) return { icon: "fa-cloud-rain", text: "Rainy", cls: "weather-rainy" };
  if (code <= 77) return { icon: "fa-snowflake", text: "Snow", cls: "weather-snowy" };
  if (code <= 82) return { icon: "fa-cloud-showers-heavy", text: "Rain showers", cls: "weather-rainy" };
  return { icon: "fa-bolt", text: "Thunderstorm", cls: "weather-stormy" };
}

function uvLevel(uv) {
  if (uv < 3) return ["Low", "low"];
  if (uv < 6) return ["Moderate", "moderate"];
  if (uv < 8) return ["High", "high"];
  if (uv < 11) return ["Very High", "very-high"];
  return ["Extreme", "extreme"];
}

function windDirection(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function hourLabel(timeString) {
  const hour = Number(timeString.slice(11, 13));
  return (hour % 12 || 12) + (hour < 12 ? " AM" : " PM");
}

function shortTime(timeString) {
  return hourLabel(timeString.slice(0, 13) + ":00").replace(/^(\d+)/, "$1") && formatClock(timeString);
}

function formatClock(timeString) {
  const hour = Number(timeString.slice(11, 13));
  const min = timeString.slice(14, 16);
  return String(hour % 12 || 12).padStart(2, "0") + ":" + min + (hour < 12 ? " AM" : " PM");
}

async function loadWeather() {
  const box = $("weather-content");
  if (!selected) {
    box.innerHTML = noCountryState();
    return;
  }
  showLoading("Loading weather...");
  try {
    const place = await getPlace();
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + place.latitude + "&longitude=" + place.longitude +
      "&timezone=auto&forecast_days=7" +
      "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code" +
      "&hourly=temperature_2m,weather_code" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max";
    const w = await Api.get(url);
    const cur = w.current;
    const daily = w.daily;
    const info = weatherInfo(cur.weather_code);

    const start = Math.max(0, w.hourly.time.findIndex(t => t >= cur.time.slice(0, 13) + ":00"));
    let hourlyHtml = "";
    for (let i = start; i < start + 24 && i < w.hourly.time.length; i++) {
      hourlyHtml += `<div class="hourly-item ${i === start ? "now" : ""}">
        <span class="hourly-time">${i === start ? "Now" : hourLabel(w.hourly.time[i])}</span>
        <div class="hourly-icon"><i class="fa-solid ${weatherInfo(w.hourly.weather_code[i]).icon}"></i></div>
        <span class="hourly-temp">${Math.round(w.hourly.temperature_2m[i])}°</span>
      </div>`;
    }

    let daysHtml = "";
    for (let i = 0; i < daily.time.length; i++) {
      const d = new Date(daily.time[i] + "T00:00:00");
      const rain = daily.precipitation_probability_max[i];
      daysHtml += `<div class="forecast-day ${i === 0 ? "today" : ""}">
        <div class="forecast-day-name">
          <span class="day-label">${i === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" })}</span>
          <span class="day-date">${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}</span>
        </div>
        <div class="forecast-icon"><i class="fa-solid ${weatherInfo(daily.weather_code[i]).icon}"></i></div>
        <div class="forecast-temps"><span class="temp-max">${Math.round(daily.temperature_2m_max[i])}°</span><span class="temp-min">${Math.round(daily.temperature_2m_min[i])}°</span></div>
        <div class="forecast-precip">${rain > 0 ? '<i class="fa-solid fa-droplet"></i><span>' + rain + "%</span>" : ""}</div>
      </div>`;
    }

    const uv = Math.round(daily.uv_index_max[0]);
    const uvInfo = uvLevel(uv);

    box.innerHTML = `
      <div class="weather-hero-card ${info.cls}">
        <div class="weather-location">
          <i class="fa-solid fa-location-dot"></i><span>${place.name}</span>
          <span class="weather-time">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
        </div>
        <div class="weather-hero-main">
          <div class="weather-hero-left">
            <div class="weather-hero-icon"><i class="fa-solid ${info.icon}"></i></div>
            <div class="weather-hero-temp"><span class="temp-value">${Math.round(cur.temperature_2m)}</span><span class="temp-unit">°C</span></div>
          </div>
          <div class="weather-hero-right">
            <div class="weather-condition">${info.text}</div>
            <div class="weather-feels">Feels like ${Math.round(cur.apparent_temperature)}°C</div>
            <div class="weather-high-low">
              <span class="high"><i class="fa-solid fa-arrow-up"></i> ${Math.round(daily.temperature_2m_max[0])}°</span>
              <span class="low"><i class="fa-solid fa-arrow-down"></i> ${Math.round(daily.temperature_2m_min[0])}°</span>
            </div>
          </div>
        </div>
      </div>

      <div class="weather-details-grid">
        <div class="weather-detail-card">
          <div class="detail-icon humidity"><i class="fa-solid fa-droplet"></i></div>
          <div class="detail-info"><span class="detail-label">Humidity</span><span class="detail-value">${cur.relative_humidity_2m}%</span></div>
          <div class="detail-bar"><div class="detail-bar-fill" style="width:${cur.relative_humidity_2m}%"></div></div>
        </div>
        <div class="weather-detail-card">
          <div class="detail-icon wind"><i class="fa-solid fa-wind"></i></div>
          <div class="detail-info"><span class="detail-label">Wind</span><span class="detail-value">${Math.round(cur.wind_speed_10m)} km/h</span></div>
          <span class="detail-extra">${windDirection(cur.wind_direction_10m)}</span>
        </div>
        <div class="weather-detail-card">
          <div class="detail-icon uv"><i class="fa-solid fa-sun"></i></div>
          <div class="detail-info"><span class="detail-label">UV Index</span><span class="detail-value">${uv}</span></div>
          <span class="uv-level ${uvInfo[1]}">${uvInfo[0]}</span>
        </div>
        <div class="weather-detail-card">
          <div class="detail-icon precip"><i class="fa-solid fa-cloud-rain"></i></div>
          <div class="detail-info"><span class="detail-label">Precipitation</span><span class="detail-value">${daily.precipitation_probability_max[0] || 0}%</span></div>
        </div>
        <div class="weather-detail-card sunrise-sunset">
          <div class="sun-times-visual">
            <div class="sun-time sunrise"><i class="fa-solid fa-sun"></i><span class="sun-label">Sunrise</span><span class="sun-value">${formatClock(daily.sunrise[0])}</span></div>
            <div class="sun-time sunset"><i class="fa-solid fa-moon"></i><span class="sun-label">Sunset</span><span class="sun-value">${formatClock(daily.sunset[0])}</span></div>
          </div>
        </div>
      </div>

      <div class="weather-section">
        <h3 class="weather-section-title"><i class="fa-solid fa-clock"></i> Hourly Forecast</h3>
        <div class="hourly-scroll">${hourlyHtml}</div>
      </div>

      <div class="weather-section">
        <h3 class="weather-section-title"><i class="fa-solid fa-calendar-week"></i> 7-Day Forecast</h3>
        <div class="forecast-list">${daysHtml}</div>
      </div>`;
  } catch (err) {
    box.innerHTML = emptyState("fa-triangle-exclamation", "Weather not available", "Could not load the weather for this city.");
  }
  hideLoading();
}

async function loadLongWeekends() {
  const box = $("lw-content");
  pageItems = {};
  if (!selected) {
    box.innerHTML = noCountryState();
    return;
  }
  showLoading("Finding long weekends...");
  try {
    const list = await Api.get(`https://date.nager.at/api/v3/LongWeekend/${selected.year}/${selected.code}`);
    let html = "";
    list.forEach((lw, index) => {
      const id = "lw-" + selected.code + "-" + lw.startDate;
      pageItems[id] = {
        id: id, type: "longweekend", title: lw.dayCount + " Day Long Weekend",
        desc: lw.needBridgeDay ? "Bridge day needed" : "No extra days needed",
        date: lw.startDate, endDate: lw.endDate
      };

      let daysHtml = "";
      const day = new Date(lw.startDate + "T00:00:00");
      const end = new Date(lw.endDate + "T00:00:00");
      while (day <= end) {
        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
        daysHtml += `<div class="lw-day ${isWeekend ? "weekend" : ""}">
          <span class="name">${day.toLocaleDateString("en-US", { weekday: "short" })}</span>
          <span class="num">${day.getDate()}</span></div>`;
        day.setDate(day.getDate() + 1);
      }

      html += `<div class="lw-card">
        <div class="lw-card-header">
          <span class="lw-badge"><i class="fa-solid fa-calendar-days"></i> ${lw.dayCount} Days</span>
          ${saveButton(id, "holiday-action-btn")}
        </div>
        <h3>Long Weekend #${index + 1}</h3>
        <div class="lw-dates"><i class="fa-regular fa-calendar"></i> ${formatDate(lw.startDate)} - ${formatDate(lw.endDate)}</div>
        ${lw.needBridgeDay
          ? '<div class="lw-info-box warning"><i class="fa-solid fa-info-circle"></i> Requires taking a bridge day off</div>'
          : '<div class="lw-info-box success"><i class="fa-solid fa-check-circle"></i> No extra days off needed!</div>'}
        <div class="lw-days-visual">${daysHtml}</div>
      </div>`;
    });
    box.innerHTML = html || emptyState("fa-umbrella-beach", "No long weekends", "Nothing found for this year.");
    listenForSave(box);
  } catch (err) {
    box.innerHTML = emptyState("fa-triangle-exclamation", "Something went wrong", "Could not load long weekends.");
  }
  hideLoading();
}

async function loadSunTimes() {
  const box = $("sun-times-content");
  if (!selected) {
    box.innerHTML = noCountryState();
    return;
  }
  showLoading("Loading sun times...");
  try {
    const place = await getPlace();
    const today = new Date().toISOString().slice(0, 10);
    const data = await Api.get("https://api.sunrise-sunset.org/json?formatted=0&lat=" + place.latitude + "&lng=" + place.longitude + "&date=" + today);
    const r = data.results;

    function time(iso) {
      return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: place.timezone });
    }

    const hours = Math.floor(r.day_length / 3600);
    const minutes = Math.floor((r.day_length % 3600) / 60);
    const percent = ((r.day_length / 86400) * 100).toFixed(1);
    const dark = 1440 - (hours * 60 + minutes);

    box.innerHTML = `
      <div class="sun-main-card">
        <div class="sun-main-header">
          <div class="sun-location"><h2><i class="fa-solid fa-location-dot"></i> ${place.name}</h2><p>Sun times for your selected location</p></div>
          <div class="sun-date-display">
            <div class="date">${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
            <div class="day">${new Date().toLocaleDateString("en-US", { weekday: "long" })}</div>
          </div>
        </div>
        <div class="sun-times-grid">
          <div class="sun-time-card dawn"><div class="icon"><i class="fa-solid fa-moon"></i></div><div class="label">Dawn</div><div class="time">${time(r.civil_twilight_begin)}</div><div class="sub-label">Civil Twilight</div></div>
          <div class="sun-time-card sunrise"><div class="icon"><i class="fa-solid fa-sun"></i></div><div class="label">Sunrise</div><div class="time">${time(r.sunrise)}</div><div class="sub-label">Golden Hour Start</div></div>
          <div class="sun-time-card noon"><div class="icon"><i class="fa-solid fa-sun"></i></div><div class="label">Solar Noon</div><div class="time">${time(r.solar_noon)}</div><div class="sub-label">Sun at Highest</div></div>
          <div class="sun-time-card sunset"><div class="icon"><i class="fa-solid fa-sun"></i></div><div class="label">Sunset</div><div class="time">${time(r.sunset)}</div><div class="sub-label">Golden Hour End</div></div>
          <div class="sun-time-card dusk"><div class="icon"><i class="fa-solid fa-moon"></i></div><div class="label">Dusk</div><div class="time">${time(r.civil_twilight_end)}</div><div class="sub-label">Civil Twilight</div></div>
          <div class="sun-time-card daylight"><div class="icon"><i class="fa-solid fa-hourglass-half"></i></div><div class="label">Day Length</div><div class="time">${hours}h ${minutes}m</div><div class="sub-label">Total Daylight</div></div>
        </div>
      </div>
      <div class="day-length-card">
        <h3><i class="fa-solid fa-chart-pie"></i> Daylight Distribution</h3>
        <div class="day-progress"><div class="day-progress-bar"><div class="day-progress-fill" style="width:${percent}%"></div></div></div>
        <div class="day-length-stats">
          <div class="day-stat"><div class="value">${hours}h ${minutes}m</div><div class="label">Daylight</div></div>
          <div class="day-stat"><div class="value">${percent}%</div><div class="label">of 24 Hours</div></div>
          <div class="day-stat"><div class="value">${Math.floor(dark / 60)}h ${dark % 60}m</div><div class="label">Darkness</div></div>
        </div>
      </div>`;
  } catch (err) {
    box.innerHTML = emptyState("fa-triangle-exclamation", "Sun times not available", "Could not load sun times for this city.");
  }
  hideLoading();
}

async function loadCurrency() {
  if (rates === null) {
    showLoading("Loading exchange rates...");
    try {
      const data = await Api.get("https://open.er-api.com/v6/latest/USD");
      rates = data.rates;
      ratesDate = data.time_last_update_utc;
      fillCurrencySelects();
    } catch (err) {
      showToast("Could not load exchange rates", "error");
    }
    hideLoading();
  }
  if (rates !== null) convertCurrency();
}

function fillCurrencySelects() {
  const names = new Intl.DisplayNames(["en"], { type: "currency" });
  let options = "";
  Object.keys(rates).forEach(code => {
    let name = code;
    try { name = names.of(code); } catch (e) { }
    options += `<option value="${code}">${code} - ${name}</option>`;
  });
  $("currency-from").innerHTML = options;
  $("currency-to").innerHTML = options;
  $("currency-from").value = "USD";
  const target = selected && selected.currency && rates[selected.currency] ? selected.currency : "EGP";
  $("currency-to").value = target;
}

function convertCurrency() {
  const amount = Number($("currency-amount").value) || 0;
  const from = $("currency-from").value;
  const to = $("currency-to").value;
  const rate = rates[to] / rates[from];
  const result = amount * rate;

  $("currency-result").innerHTML = `
    <div class="conversion-display">
      <div class="conversion-from"><span class="amount">${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><span class="currency-code">${from}</span></div>
      <div class="conversion-equals"><i class="fa-solid fa-equals"></i></div>
      <div class="conversion-to"><span class="amount">${result.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><span class="currency-code">${to}</span></div>
    </div>
    <div class="exchange-rate-info">
      <p>1 ${from} = ${rate.toFixed(4)} ${to}</p>
      <small>Last updated: ${new Date(ratesDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</small>
    </div>`;

  showPopularCurrencies(from);
}

function showPopularCurrencies(from) {
  const list = [
    ["EUR", "eu"], ["GBP", "gb"], ["EGP", "eg"], ["AED", "ae"],
    ["SAR", "sa"], ["JPY", "jp"], ["CAD", "ca"], ["INR", "in"]
  ];
  const names = new Intl.DisplayNames(["en"], { type: "currency" });
  let html = "";
  list.forEach(item => {
    if (item[0] === from) return;
    const rate = rates[item[0]] / rates[from];
    html += `<div class="popular-currency-card" data-code="${item[0]}">
      <img src="https://flagcdn.com/w40/${item[1]}.png" alt="" class="flag">
      <div class="info"><div class="code">${item[0]}</div><div class="name">${names.of(item[0])}</div></div>
      <div class="rate">${rate.toFixed(4)}</div>
    </div>`;
  });
  $("popular-currencies").innerHTML = html;
}

function renderPlans() {
  updatePlanCount();
  const all = plans.items;
  $("filter-all-count").textContent = all.length;
  $("filter-holiday-count").textContent = all.filter(p => p.type === "holiday").length;
  $("filter-event-count").textContent = all.filter(p => p.type === "event").length;
  $("filter-lw-count").textContent = all.filter(p => p.type === "longweekend").length;

  document.querySelectorAll(".plan-filter").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.filter === currentFilter);
  });

  const list = currentFilter === "all" ? all : all.filter(p => p.type === currentFilter);
  const box = $("plans-content");

  if (list.length === 0) {
    box.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><i class="fa-solid fa-heart-crack"></i></div>
      <h3>No Saved Plans Yet</h3>
      <p>Start exploring and save holidays, events, or long weekends you like!</p>
      <button class="btn-primary" id="start-exploring-btn"><i class="fa-solid fa-compass"></i> Start Exploring</button>
    </div>`;
    return;
  }

  const labels = { holiday: "Holiday", event: "Event", longweekend: "Long Weekend" };
  let html = "";
  list.forEach(p => {
    const dateText = p.endDate ? formatDate(p.date) + " - " + formatDate(p.endDate) : formatDate(p.date);
    html += `<div class="plan-card">
      <span class="plan-card-type ${p.type}">${labels[p.type]}</span>
      <div class="plan-card-content">
        <h4>${p.title}</h4>
        <div class="plan-card-details">
          <div><i class="fa-regular fa-calendar"></i>${dateText}</div>
          <div><i class="fa-solid fa-circle-info"></i>${p.desc}</div>
        </div>
        <div class="plan-card-actions">
          <button class="btn-plan-remove" data-remove="${p.id}"><i class="fa-solid fa-trash"></i> Remove</button>
        </div>
      </div>
    </div>`;
  });
  box.innerHTML = html;
}

function setupEvents() {
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", function (e) {
      e.preventDefault();
      showPage(item.dataset.view, true);
    });
  });
  $("mobile-menu-btn").addEventListener("click", openSidebar);
  $("sidebar-overlay").addEventListener("click", closeSidebar);
  window.addEventListener("popstate", () => showPage(pageFromUrl(), false));

  $("global-country").addEventListener("change", onCountryChange);
  $("global-city").addEventListener("change", onCityChange);
  $("global-year").addEventListener("change", onYearChange);
  $("global-search-btn").addEventListener("click", onExplore);
  $("clear-selection-btn").addEventListener("click", clearSelection);

  $("convert-btn").addEventListener("click", () => { if (rates) convertCurrency(); });
  $("currency-amount").addEventListener("input", () => { if (rates) convertCurrency(); });
  $("currency-from").addEventListener("change", () => { if (rates) convertCurrency(); });
  $("currency-to").addEventListener("change", () => { if (rates) convertCurrency(); });
  $("swap-currencies-btn").addEventListener("click", function () {
    const temp = $("currency-from").value;
    $("currency-from").value = $("currency-to").value;
    $("currency-to").value = temp;
    if (rates) convertCurrency();
  });
  $("popular-currencies").addEventListener("click", function (e) {
    const card = e.target.closest(".popular-currency-card");
    if (!card) return;
    $("currency-to").value = card.dataset.code;
    convertCurrency();
  });

  document.querySelectorAll(".plan-filter").forEach(btn => {
    btn.addEventListener("click", function () {
      currentFilter = btn.dataset.filter;
      renderPlans();
    });
  });
  $("plans-content").addEventListener("click", function (e) {
    const removeBtn = e.target.closest("[data-remove]");
    if (removeBtn) {
      plans.remove(removeBtn.dataset.remove);
      renderPlans();
      showToast("Removed from My Plans", "info");
    }
    if (e.target.closest("#start-exploring-btn")) showPage("dashboard", true);
  });
  $("clear-all-plans-btn").addEventListener("click", function () {
    if (plans.items.length === 0) return;
    Swal.fire({
      title: "Clear all plans?",
      text: "This will remove all your saved plans.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, clear"
    }).then(result => {
      if (result.isConfirmed) {
        plans.clear();
        renderPlans();
      }
    });
  });
}

async function init() {
  setupEvents();
  updateClock();
  setInterval(updateClock, 30000);
  updatePlanCount();

  showLoading("Loading Wanderlust...");
  try {
    await loadCountries();
  } catch (err) {
    showToast("Could not load countries list", "error");
  }

  if (selected) {
    $("global-country").value = selected.code;
    $("global-year").value = selected.year;
    showSelectedBox();
    await loadCities(selected.name, selected.city);
    try { await loadCountryInfo(); } catch (err) { showCountryPlaceholder(); }
  } else {
    showSelectedBox();
    showCountryPlaceholder();
  }
  hideLoading();

  showPage(pageFromUrl(), false);
}

init();