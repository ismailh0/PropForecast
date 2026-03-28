// Line chart showing average yearly sale prices for the searched area.
// Uses the Chart.js library via its React wrapper 

import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

// register only the Chart.js modules used by this chart
ChartJS.register(
  CategoryScale,  // x axis with category labels 
  LinearScale,    // y axis with numeric values
  PointElement,   // dots on the line
  LineElement,    // the line itself
  Title,
  Tooltip,        // hover tooltips
  Legend,
  Filler          // fills area beneath the line
);

export default function PriceChart({ historyData }) {
  // don't render if data hasn't loaded yet
  if (!historyData) return null;

  // extract year labels and average prices from the history array
  const labels = historyData.history.map((r) => r.year);
  const prices = historyData.history.map((r) => Math.round(r.avg_price));

  // Chart.js data format 
  const data = {
    labels,
    datasets: [
      {
        label: 'Avg price (£)',
        data: prices,
        borderColor: '#2a6496',
        backgroundColor: 'rgba(42,100,150,0.1)',
        borderWidth: 2,
        pointRadius: 3,
        fill: true,    
        tension: 0.3,  
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { display: false }, // hides the legend 
    },
    scales: {
      y: {
        ticks: {
          // Format y-axis values as £850k instead of 850000
          callback: (v) => '£' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v),
        },
      },
    },
  };

  return <Line id="price-chart" data={data} options={options} />;
}
