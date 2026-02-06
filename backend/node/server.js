const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const METADATA_FILE = '../storage/index_metadata.json';

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend server running' });
});

// Get all indexed folders
app.get('/api/indexes', (req, res) => {
  try {
    if (fs.existsSync(METADATA_FILE)) {
      const metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));
      res.json(metadata);
    } else {
      res.json({ indexes: [] });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete an index
app.delete('/api/indexes/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await runPythonScript('index_metadata.py', ['delete', id]);
    res.json({ success: true, message: 'Index deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crawl directory endpoint
app.post('/api/crawl', (req, res) => {
  const { folderPath } = req.body;
  
  if (!folderPath || !fs.existsSync(folderPath)) {
    return res.status(400).json({ error: 'Invalid folder path' });
  }
  
  const files = crawlDirectory(folderPath);
  res.json({ 
    success: true, 
    fileCount: files.length,
    files: files.slice(0, 10)
  });
});

// Index a folder with SSE progress streaming + metadata tracking
app.post('/api/index', async (req, res) => {
  const { folderPath, isReindex = false } = req.body;
  
  if (!folderPath || !fs.existsSync(folderPath)) {
    return res.status(400).json({ error: 'Invalid folder path' });
  }
  
  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  try {
    const allFiles = crawlDirectory(folderPath);
    
    // Determine which files need indexing
    let filesToIndex = allFiles;
    let skippedCount = 0;
    
    if (isReindex) {
      // Check metadata for changes
      const metadataCheck = await checkFilesNeedingIndex(folderPath, allFiles);
      filesToIndex = metadataCheck.needsIndex;
      skippedCount = metadataCheck.unchanged.length;
      
      res.write(`data: ${JSON.stringify({
        type: 'info',
        message: `Found ${filesToIndex.length} new/modified files, ${skippedCount} unchanged`
      })}\n\n`);
    }
    
    const totalFiles = filesToIndex.length;
    let indexed = 0;
    const startTime = Date.now();
    const filesMetadata = {};
    
    // Send initial progress
    res.write(`data: ${JSON.stringify({
      type: 'progress',
      current: 0,
      total: totalFiles,
      currentFile: '',
      message: 'Starting indexing...'
    })}\n\n`);
    
    for (let i = 0; i < filesToIndex.length; i++) {
      const file = filesToIndex[i];
      const ext = file.extension.toLowerCase();
      
      // Send progress update
      const elapsed = Date.now() - startTime;
      const avgTimePerFile = i > 0 ? elapsed / i : 0;
      const remaining = (totalFiles - i) * avgTimePerFile;
      const eta = remaining > 0 ? Math.ceil(remaining / 1000) : 0;
      
      res.write(`data: ${JSON.stringify({
        type: 'progress',
        current: i + 1,
        total: totalFiles,
        currentFile: file.name,
        message: `Processing ${file.name}...`,
        eta: eta
      })}\n\n`);
      
      let content = null;
      
      try {
        // Handle text files
        if (['.txt', '.md'].includes(ext)) {
          content = fs.readFileSync(file.path, 'utf-8');
        }
        // Handle PDF files
        else if (ext === '.pdf') {
          content = await extractFileContent(file.path, 'parse_pdf.py');
        }
        // Handle DOCX files
        else if (ext === '.docx') {
          content = await extractFileContent(file.path, 'parse_docx.py');
        }
        // Handle CSV files
        else if (ext === '.csv') {
          content = await extractFileContent(file.path, 'parse_csv.py');
        }
        // Handle JSON files
        else if (ext === '.json') {
          content = await extractFileContent(file.path, 'parse_json.py');
        }
        
        // Index if content was extracted successfully
        if (content && !content.startsWith('Error')) {
          const indexResult = await indexDocument(file.path, content);
          
          // Extract hash from result
          const hashMatch = indexResult.match(/Hash: ([^\s]+)/);
          const fileHash = hashMatch ? hashMatch[1] : null;
          
          filesMetadata[file.path] = {
            hash: fileHash,
            indexed_at: new Date().toISOString(),
            size: file.size
          };
          
          indexed++;
        }
      } catch (error) {
        // Skip files that fail to index
        console.error(`Failed to index ${file.path}:`, error.message);
      }
    }
    
    // Update metadata
    await updateIndexMetadata(folderPath, filesMetadata);
    
    // Send completion
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      success: true,
      totalFiles: totalFiles,
      indexed: indexed,
      skipped: skippedCount,
      message: `Successfully indexed ${indexed} documents${skippedCount > 0 ? `, skipped ${skippedCount} unchanged` : ''}`
    })}\n\n`);
    
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error.message
    })}\n\n`);
    res.end();
  }
});

// Search documents (WITH METADATA)
app.post('/api/search', async (req, res) => {
  const { query, limit = 10 } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'No query provided' });
  }
  
  try {
    const results = await searchDocuments(query, limit);
    
    // Enrich results with file metadata
    const enrichedResults = results.map(result => {
      try {
        const stats = fs.statSync(result.file_path);
        return {
          ...result,
          file_size: stats.size,
          modified_date: stats.mtime,
          word_count: result.text ? result.text.split(/\s+/).length : 0
        };
      } catch (error) {
        // If file doesn't exist anymore, return original result
        return result;
      }
    });
    
    res.json({ 
      success: true, 
      query: query,
      results: enrichedResults
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper: Check which files need indexing
async function checkFilesNeedingIndex(folderPath, allFiles) {
  return new Promise((resolve, reject) => {
    const pythonPath = '../../venv/bin/python';
    const scriptPath = '../python/index_metadata.py';
    
    const python = spawn(pythonPath, [scriptPath, 'check', folderPath, JSON.stringify(allFiles)]);
    
    let output = '';
    
    python.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        // If script fails, index all files
        resolve({ needsIndex: allFiles, unchanged: [], deleted: [] });
      } else {
        try {
          resolve(JSON.parse(output));
        } catch (e) {
          resolve({ needsIndex: allFiles, unchanged: [], deleted: [] });
        }
      }
    });
  });
}

// Helper: Update index metadata
async function updateIndexMetadata(folderPath, filesMetadata) {
  return new Promise((resolve, reject) => {
    const pythonPath = '../../venv/bin/python';
    const scriptPath = '../python/index_metadata.py';
    
    const python = spawn(pythonPath, [scriptPath, 'update', folderPath, JSON.stringify(filesMetadata)]);
    
    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('Failed to update metadata'));
      } else {
        resolve(true);
      }
    });
  });
}

// Helper: Crawl directory
function crawlDirectory(dirPath, fileList = []) {
  const files = fs.readdirSync(dirPath);
  
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      crawlDirectory(filePath, fileList);
    } else {
      fileList.push({
        path: filePath,
        name: file,
        extension: path.extname(file),
        size: stat.size,
        modified: stat.mtime
      });
    }
  });
  
  return fileList;
}

// Helper: Index a document (FIXED - use stdin instead of argv)
function indexDocument(filePath, content) {
  return new Promise((resolve, reject) => {
    const pythonPath = '../../venv/bin/python';
    const scriptPath = '../python/index_doc.py';
    
    // Pass filepath as argument, content via stdin
    const python = spawn(pythonPath, [scriptPath, filePath]);
    
    let output = '';
    let errorOutput = '';
    
    python.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Indexing failed for ${filePath}: ${errorOutput}`));
      } else {
        resolve(output);
      }
    });
    
    // Write content to stdin and close
    python.stdin.write(content);
    python.stdin.end();
  });
}

// Helper: Extract file content using Python parsers
function extractFileContent(filePath, parserScript) {
  return new Promise((resolve, reject) => {
    const pythonPath = '../../venv/bin/python';
    const scriptPath = `../python/${parserScript}`;
    
    const python = spawn(pythonPath, [scriptPath, filePath]);
    
    let output = '';
    
    python.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`File extraction failed: ${parserScript}`));
      } else {
        resolve(output);
      }
    });
  });
}

// Helper: Search documents
function searchDocuments(query, limit) {
  return new Promise((resolve, reject) => {
    const pythonPath = '../../venv/bin/python';
    const scriptPath = '../python/search_docs.py';
    
    const python = spawn(pythonPath, [scriptPath, query, limit.toString()]);
    
    let output = '';
    
    python.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Search failed`));
      } else {
        try {
          resolve(JSON.parse(output));
        } catch (e) {
          reject(new Error(`Failed to parse search results`));
        }
      }
    });
  });
}

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📁 Crawl API: POST /api/crawl`);
  console.log(`📚 Index API: POST /api/index (with SSE progress + metadata)`);
  console.log(`   Supported: TXT, MD, PDF, DOCX, CSV, JSON`);
  console.log(`🔍 Search API: POST /api/search`);
  console.log(`📊 Indexes API: GET /api/indexes`);
});
