const errorMessage = 'ApexCharts global not found. Ensure the CDN script has been loaded before importing from "apexcharts".';

function getApexCharts() {
  const g = typeof globalThis !== 'undefined' ? globalThis : undefined;
  if (g && g.ApexCharts) {
    return g.ApexCharts;
  }
  throw new Error(errorMessage);
}

const ApexChartsProxy = new Proxy(function ApexChartsProxy() {}, {
  construct(_target, args) {
    const Apex = getApexCharts();
    return new Apex(...args);
  },
  apply(_target, thisArg, args) {
    const Apex = getApexCharts();
    return Apex.apply(thisArg, args);
  },
  get(_target, prop, receiver) {
    if (prop === Symbol.toStringTag) {
      return 'ApexChartsProxy';
    }
    const Apex = getApexCharts();
    const value = Apex[prop];
    if (typeof value === 'function') {
      return value.bind(Apex);
    }
    return value;
  }
});

export default ApexChartsProxy;
export { ApexChartsProxy };
