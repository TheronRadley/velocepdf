#pragma once
#include <string>
#include <vector>

/**
 * VelocePDF Core — C++ wrapper inspired by SumatraPDF's architecture.
 * 
 * SumatraPDF separates UI (Win32) from rendering engine (MuPDF via EngineBase).
 * We mirror that: EngineBase -> VeloceEngine, with minimal dependencies.
 * 
 * Real MuPDF context is held in Python via PyMuPDF (fitz); this C++ layer
 * provides fast search indexing and annotation handling close to Sumatra's
 * TextSearch.cpp and Annotation.cpp.
 */

struct PageText {
    int page_no;
    std::string text;
    std::vector<std::pair<int,int>> word_offsets; // char offsets
};

class VeloceEngine {
public:
    VeloceEngine();
    ~VeloceEngine();

    // Load from memory (like Sumatra's FileDataCache)
    bool LoadFromBytes(const unsigned char* data, size_t len, const char* password = nullptr);
    int PageCount() const;
    std::string GetText(int page_no) const;
    std::string GetTitle() const;
    std::vector<std::string> GetOutline() const;

    // Fast search — Boyer-Moore-Horspool, inspired by Sumatra's TextSearch
    struct SearchResult {
        int page;
        int offset;
        std::string snippet;
    };
    std::vector<SearchResult> Search(const std::string& query, int max_results = 500) const;

    bool HasSignatures() const;
};

