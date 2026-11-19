import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// These are used by several functions, so they live out here
let xScale;
let yScale;
let rScale;

// Lab 8, Step 2.4: one color per technology (css, html, js, ...)
let colors = d3.scaleOrdinal(d3.schemeTableau10);

// ===== Lab 6, Step 1.1: read the CSV file and turn text into numbers/dates =====
async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));
  return data;
}

// ===== Lab 6, Step 1.2: group the lines into one object per commit =====
function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      let first = lines[0];
      let { author, date, time, timezone, datetime } = first;
      let ret = {
        id: commit,
        url: 'https://github.com/aasim-ucsd/portfolio/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        // e.g. 2:30 PM = 14.5
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      // Keep the original lines, but hide them when printing the commit
      Object.defineProperty(ret, 'lines', {
        value: lines,
        enumerable: false,
        writable: false,
        configurable: false,
      });

      return ret;
    })
    // Lab 8, Step 3.3: oldest commit first, so the story goes in order
    .sort((a, b) => a.datetime - b.datetime);
}

// ===== Lab 6, Step 1.3: summary stats (Lab 8: redrawn for the filtered commits) =====
function renderCommitInfo(data, commits) {
  // Clear the old stats before drawing new ones
  d3.select('#stats').selectAll('*').remove();

  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  // Total lines of code
  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(data.length);

  // Total commits
  dl.append('dt').text('Total commits');
  dl.append('dd').text(commits.length);

  // Number of files
  dl.append('dt').text('Files');
  dl.append('dd').text(d3.group(data, (d) => d.file).size);

  // Longest file (in lines)
  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (v) => v.line),
    (d) => d.file,
  );
  dl.append('dt').text('Longest file');
  dl.append('dd').text((d3.max(fileLengths, (d) => d[1]) ?? 0) + ' lines');

  // Deepest indentation
  dl.append('dt').text('Max depth');
  dl.append('dd').text(d3.max(data, (d) => d.depth) ?? 0);

  // Time of day when most work is done
  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) => new Date(d.datetime).toLocaleString('en', { dayPeriod: 'short' }),
  );
  dl.append('dt').text('Most work done');
  dl.append('dd').text(d3.greatest(workByPeriod, (d) => d[1])?.[0] ?? '–');
}

// Chart size, shared by renderScatterPlot and updateScatterPlot
const width = 1000;
const height = 600;
const margin = { top: 10, right: 10, bottom: 30, left: 20 };
const usableArea = {
  top: margin.top,
  right: width - margin.right,
  bottom: height - margin.bottom,
  left: margin.left,
  width: width - margin.left - margin.right,
  height: height - margin.top - margin.bottom,
};

// ===== Lab 6, Step 2: scatterplot of commits by date and time of day =====
function renderScatterPlot(data, commits) {
  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  // Scales (dates across, hours of the day up and down)
  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();
  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  // Faint horizontal grid lines (drawn first so they sit behind)
  svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  // Dot size shows how many lines the commit edited (square root scale = fair area)
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

  svg.append('g').attr('class', 'dots');

  // Axes. Lab 8, Step 1.2: give them classes so we can find them later
  svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .attr('class', 'x-axis')
    .call(d3.axisBottom(xScale).ticks(5));
  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .attr('class', 'y-axis')
    .call(
      d3
        .axisLeft(yScale)
        .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00'),
    );

  drawDots(commits);

  // Lab 6, Step 5: brushing
  createBrushSelector(svg);
}

// ===== Lab 8, Step 1.2: update the existing scatterplot instead of making a new one =====
function updateScatterPlot(data, commits) {
  const svg = d3.select('#chart').select('svg');

  // Squeeze the x-axis to just the visible commits
  xScale = xScale.domain(d3.extent(commits, (d) => d.datetime)).nice();

  // Clear the old x-axis and draw the new one
  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(d3.axisBottom(xScale).ticks(5));

  drawDots(commits);
}

// The dots, shared by both functions above
function drawDots(commits) {
  // Big dots first, so small dots on top stay hoverable
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  d3.select('#chart svg g.dots')
    .selectAll('circle')
    // Lab 8, Step 1.3: key each circle by its commit id so circles stay stable
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });
}

// ===== Lab 6, Step 3: tooltip =====
function renderTooltipContent(commit) {
  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  const time = document.getElementById('commit-time');
  const author = document.getElementById('commit-author');
  const lines = document.getElementById('commit-lines');

  if (Object.keys(commit).length === 0) return;

  link.href = commit.url;
  link.textContent = commit.id;
  date.textContent = commit.datetime?.toLocaleString('en', { dateStyle: 'full' });
  time.textContent = commit.datetime?.toLocaleString('en', { timeStyle: 'short' });
  author.textContent = commit.author;
  lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.style.left = `${event.clientX}px`;
  tooltip.style.top = `${event.clientY}px`;
}

// ===== Lab 6, Step 5: brushing to select commits =====
function createBrushSelector(svg) {
  svg.call(d3.brush().on('start brush end', brushed));

  // Move the dots above the brush overlay so tooltips still work
  svg.selectAll('.dots, .overlay ~ *').raise();
}

function brushed(event) {
  const selection = event.selection;
  d3.selectAll('#chart circle').classed('selected', (d) =>
    isCommitSelected(selection, d),
  );
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

// Is this commit's dot inside the brushed rectangle?
function isCommitSelected(selection, commit) {
  if (!selection) {
    return false;
  }
  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

// How many commits are selected (only counting the ones currently shown)
function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];

  const countElement = document.querySelector('#selection-count');
  countElement.textContent = `${selectedCommits.length || 'No'} commits selected`;

  return selectedCommits;
}

// Which languages the selected commits' lines are in
function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById('language-breakdown');

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }

  const lines = selectedCommits.flatMap((d) => d.lines);

  // Count lines per language
  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type,
  );

  container.innerHTML = '';
  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format('.1~%')(proportion);
    container.innerHTML += `
      <dt>${language}</dt>
      <dd>${count} lines (${formatted})</dd>
    `;
  }
}

// ===== Lab 8, Step 2: unit visualization: one dot per line of code =====
function updateFileDisplay(filteredCommits) {
  let lines = filteredCommits.flatMap((d) => d.lines);

  // Step 2.1 + 2.3: group lines by file, biggest file first
  let files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => {
      return { name, lines };
    })
    .sort((a, b) => b.lines.length - a.lines.length);

  let filesContainer = d3
    .select('#files')
    .selectAll('div')
    .data(files, (d) => d.name)
    .join(
      // This code only runs when the div is first created
      (enter) =>
        enter.append('div').call((div) => {
          div.append('dt').append('code');
          div.append('dd');
        }),
    );

  // File name, with the line count underneath
  filesContainer
    .select('dt > code')
    .html((d) => `${d.name}<small>${d.lines.length} lines</small>`);

  // Step 2.2 + 2.4: one dot per line, colored by technology
  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    .attr('style', (d) => `--color: ${colors(d.type)}`);
}

// ===== Run everything =====
let data = await loadData();
let commits = processCommits(data);

// Lab 8, Step 1.1: slider position (0–100%) <-> a date
let commitProgress = 100;
let timeScale = d3
  .scaleTime()
  .domain([
    d3.min(commits, (d) => d.datetime),
    d3.max(commits, (d) => d.datetime),
  ])
  .range([0, 100]);
let commitMaxTime = timeScale.invert(commitProgress);

// Lab 8, Step 1.2: the commits up to the selected time
let filteredCommits = commits;

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);
updateFileDisplay(commits);

// Update everything for a new "show commits until" time
function showCommitsUntil(maxTime) {
  commitMaxTime = maxTime;
  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
  const filteredLines = filteredCommits.flatMap((d) => d.lines);

  document.getElementById('commit-slider-time').textContent =
    commitMaxTime.toLocaleString('en', { dateStyle: 'long', timeStyle: 'short' });

  renderCommitInfo(filteredLines, filteredCommits);
  updateScatterPlot(data, filteredCommits);
  updateFileDisplay(filteredCommits);
}

// Lab 8, Step 1.1: when the slider moves
const slider = document.getElementById('commit-progress');

function onTimeSliderChange() {
  commitProgress = Number(slider.value);
  showCommitsUntil(timeScale.invert(commitProgress));
}

slider.addEventListener('input', onTimeSliderChange);
onTimeSliderChange();

// ===== Lab 8, Step 3.2: one paragraph of story per commit =====
d3.select('#scatter-story')
  .selectAll('.step')
  .data(commits)
  .join('div')
  .attr('class', 'step')
  .html(
    (d, i) => `
      On ${d.datetime.toLocaleString('en', {
        dateStyle: 'full',
        timeStyle: 'short',
      })},
      I made <a href="${d.url}" target="_blank">${
        i > 0 ? 'another commit' : 'my first commit'
      }</a>.
      I edited ${d.totalLines} lines across ${
        d3.rollups(
          d.lines,
          (D) => D.length,
          (d) => d.file,
        ).length
      } files.
    `,
  );

// ===== Lab 8, Step 3.3: when a story step reaches the middle of the screen,
// show the commits up to that step's commit =====
function onStepEnter(response) {
  const commitTime = response.element.__data__.datetime;

  // Keep the slider in sync with the story
  slider.value = timeScale(commitTime);
  showCommitsUntil(commitTime);
}

const scroller = scrollama();
scroller
  .setup({
    container: '#scrolly-1',
    step: '#scrolly-1 .step',
  })
  .onStepEnter(onStepEnter);