import { useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import './SearchPage.css';

const API_BASE = "http://localhost:3001";

interface SearchResult {
  file_path: string;
  text: string;
  _distance: number;
  file_size?: number;
  modified_date?: string;
  word_count?: number;
}

export function SearchPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    setHasSearched(true);
    
    try {
      const response = await fetch(`${API_BASE}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, limit: 10 })
      });
      const data = await response.json();
      setResults(data.results);
    } catch (error) {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleOpenFile = async (filePath: string) => {
    try {
      await openPath(filePath);
    } catch (error) {
      console.error("Failed to open file");
    }
  };

  const getFileInfo = (filePath: string) => {
    const parts = filePath.split('/');
    const filename = parts[parts.length - 1];
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    return { filename, extension };
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="page">
      <div className="page-container">
        <div className="search-section">
          <h1>What are you looking for?</h1>
          
          <form onSubmit={handleSearch} className="search-form">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search using natural language..."
              className="search-input"
              disabled={searching}
              autoFocus
            />
            <button type="submit" className="btn-search" disabled={searching || !searchQuery.trim()}>
              {searching ? "Searching..." : "Search"}
            </button>
          </form>
        </div>

        {hasSearched && (
          <div className="results-container">
            {searching ? (
              <div className="loading-state">
                <div className="spinner" />
                <p>Searching documents...</p>
              </div>
            ) : results.length > 0 ? (
              <>
                <div className="results-count">
                  {results.length} {results.length === 1 ? 'result' : 'results'}
                </div>
                <div className="results-list">
                  {results.map((result, i) => {
                    const { filename, extension } = getFileInfo(result.file_path);
                    const score = ((2 - result._distance) / 2 * 100).toFixed(0);
                    
                    return (
                      <div key={i} className="result-card">
                        <div className="result-header">
                          <div className="result-title">
                            <span className={`file-badge badge-${extension}`}>
                              {extension.toUpperCase()}
                            </span>
                            <h3>{filename}</h3>
                          </div>
                          <div className="result-meta-top">
                            <span className="match-score">{score}% match</span>
                            <button
                              onClick={() => handleOpenFile(result.file_path)}
                              className="btn-open"
                            >
                              Open
                            </button>
                          </div>
                        </div>

                        <div className="result-content">
                          {result.text}
                        </div>

                        <div className="result-footer">
                          {result.file_size && <span>{formatFileSize(result.file_size)}</span>}
                          {result.modified_date && <span>{formatDate(result.modified_date)}</span>}
                          {result.word_count && <span>{result.word_count} words</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <h3>No results found</h3>
                <p>Try a different search query or verify your documents are indexed</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
