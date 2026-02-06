// API utility functions

const API_BASE = "http://localhost:3001";

export interface IndexProgress {
  current: number;
  total: number;
  currentFile: string;
  status: string;
}

export interface SearchResult {
  file_path: string;
  text: string;
  _distance: number;
  file_size?: number;
  modified_date?: string;
  word_count?: number;
}

export const api = {
  // Health check
  async health(): Promise<{ status: string; message: string }> {
    const response = await fetch(`${API_BASE}/health`);
    return response.json();
  },

  // Index folder with progress updates
  async indexFolder(
    folderPath: string,
    onProgress?: (progress: IndexProgress) => void
  ): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/api/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath })
    });
    return response.json();
  },

  // Search documents
  async search(query: string, limit: number = 10): Promise<SearchResult[]> {
    const response = await fetch(`${API_BASE}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit })
    });
    const data = await response.json();
    return data.results;
  }
};
