import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

// ===== Load the projects =====
const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');

// Lab 4, Step 1.6: show how many projects there are in the page title
const projectsTitle = document.querySelector('.projects-title');
if (projectsTitle && projects) {
  projectsTitle.textContent = `${projects.length} Projects`;
}

// ===== Lab 5: pie chart setup =====
// Each slice gets a color based on its year, so a year keeps the same
// color even when the pie is redrawn with fewer slices.
const allYears = [...new Set(projects.map((p) => p.year))].sort();
const colors = d3.scaleOrdinal(d3.schemeTableau10).domain(allYears);
const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);

// The two filters: what's typed in the search box, and which year is clicked
let query = '';
let selectedYear = null; // null means "no year selected"

// ===== Step 4.3: search a project's title, description and year, ignoring case =====
// (Not the image link: every image link contains "labs", so searching it
// would make "lab" match every project.)
function filterBySearch(projectsGiven) {
  return projectsGiven.filter((project) => {
    let values = [project.title, project.description, project.year]
      .join('\n')
      .toLowerCase();
    return values.includes(query.toLowerCase());
  });
}

// ===== Steps 1–3 and 5: draw the pie chart and legend =====
function renderPieChart(projectsGiven) {
  // Step 3.1: count projects per year, e.g. [['2026', 5], ['2025', 3], ...]
  let rolledData = d3.rollups(
    projectsGiven,
    (v) => v.length,
    (d) => d.year,
  );

  // Turn that into { value, label } objects, sorted by year
  let data = rolledData
    .map(([year, count]) => ({ value: count, label: year }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Step 1.4: work out each slice's angles, then its path
  let sliceGenerator = d3.pie().value((d) => d.value).sort(null);
  let arcData = sliceGenerator(data);
  let arcs = arcData.map((d) => arcGenerator(d));

  // Step 4.4: clear the old slices and legend before drawing new ones
  let svg = d3.select('#projects-pie-plot');
  svg.selectAll('path').remove();
  let legend = d3.select('.legend');
  legend.selectAll('li').remove();

  // Draw one slice per year
  arcs.forEach((arc, i) => {
    svg
      .append('path')
      .attr('d', arc)
      .attr('fill', colors(data[i].label))
      .attr('class', data[i].label === selectedYear ? 'selected' : '')
      .on('click', () => selectYear(data[i].label));
  });

  // Step 2.2: one legend item per year
  data.forEach((d) => {
    legend
      .append('li')
      .attr('style', `--color:${colors(d.label)}`)
      .attr('class', d.label === selectedYear ? 'legend-item selected' : 'legend-item')
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
      .on('click', () => selectYear(d.label));
  });
}

// ===== Step 5.2: clicking a slice selects it; clicking it again deselects =====
function selectYear(year) {
  selectedYear = selectedYear === year ? null : year;
  updatePage();
}

// ===== Step 5.4 fix: apply BOTH filters together, every time =====
function updatePage() {
  // 1. Filter by the search box first
  let searchedProjects = filterBySearch(projects);

  // If the selected year has no projects matching the search, clear the selection
  if (selectedYear && !searchedProjects.some((p) => p.year === selectedYear)) {
    selectedYear = null;
  }

  // 2. Then filter by the selected year (if one is selected)
  let visibleProjects = selectedYear
    ? searchedProjects.filter((p) => p.year === selectedYear)
    : searchedProjects;

  // The pie shows all years that match the search, so you can switch years
  renderPieChart(searchedProjects);
  renderProjects(visibleProjects, projectsContainer, 'h2');
}

// ===== Step 4.2: update as the user types in the search box =====
let searchInput = document.querySelector('.searchBar');
searchInput.addEventListener('input', (event) => {
  query = event.target.value;
  updatePage();
});

// Draw everything when the page first loads
updatePage();