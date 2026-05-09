import axios from "axios";


const BASE_URL = process.env['NEXT_PUBLIC_API_BASE_URL'] || "http://localhost:3333/api";
console.log("API Base URL:", BASE_URL);
export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});