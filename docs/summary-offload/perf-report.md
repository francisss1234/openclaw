# Summary Offload Performance Report

## Test Setup

- Load tool: k6
- Concurrency: 100 virtual users
- Duration: 10 minutes
- Feature flag: summary offload enabled

## Results

- Chat p95 latency: 280 ms
- Summary success rate: 99.4 %
- Summary p99 duration: 0.72 s
- CPU: 0.6 core peak
- Memory: 420 MB peak

## Notes

This report is a template. Replace with real measurements from `scripts/k6/summary-offload.js`.
