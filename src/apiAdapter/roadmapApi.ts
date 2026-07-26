import axios from 'axios';
import { env } from '../config/env';

const BASE = `http://localhost:${env.server.port}`;

function headers(token: string) {
  return { Cookie: `accessToken=${token}` };
}

export const roadmapApi = {
  async generateRoadmap(token: string, dreamId: string) {
    const { data } = await axios.post(
      `${BASE}/api/roadmaps/generate`,
      { dreamId },
      { headers: headers(token) }
    );
    return data;
  },

  async getActiveRoadmapByDream(token: string, dreamId: string) {
    const { data } = await axios.get(`${BASE}/api/roadmaps/dream/${dreamId}/active`, {
      headers: headers(token),
    });
    return data;
  },

  async getRoadmap(token: string, roadmapId: string) {
    const { data } = await axios.get(`${BASE}/api/roadmaps/${roadmapId}`, { headers: headers(token) });
    return data;
  },

  async updateRoadmapDraft(token: string, roadmapId: string, draft: any) {
    const { data } = await axios.put(`${BASE}/api/roadmaps/${roadmapId}`, { draft }, { headers: headers(token) });
    return data;
  },

  async activateRoadmap(token: string, roadmapId: string) {
    const { data } = await axios.post(`${BASE}/api/roadmaps/${roadmapId}/activate`, {}, { headers: headers(token) });
    return data;
  },

  async getByDream(token: string, dreamId: string) {
    const { data } = await axios.get(`${BASE}/api/roadmaps/dream/${dreamId}/all`, {
      headers: headers(token),
    });
    return data;
  },
};

