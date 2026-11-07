#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <string>
#include <vector>
#include <algorithm>

namespace py = pybind11;

// Expose the BMH search to Python — hot path for large docs
// Mirrors SumatraPDF's TextSearch::FindAll

int bmh_search(const std::string& haystack, const std::string& needle) {
    if (needle.empty() || haystack.size() < needle.size()) return -1;
    int n = (int)haystack.size(), m = (int)needle.size();
    int bad[256];
    for (int i=0;i<256;i++) bad[i]=m;
    for (int i=0;i<m-1;i++) bad[(unsigned char)std::tolower(needle[i])] = m-1-i;
    int s=0;
    while (s <= n - m) {
        int j=m-1;
        while (j>=0 && std::tolower(haystack[s+j])==std::tolower(needle[j])) j--;
        if (j<0) return s;
        s += bad[(unsigned char)std::tolower(haystack[s+m-1])];
    }
    return -1;
}

std::vector<std::pair<int,int>> find_all(const std::string& text, const std::string& query) {
    std::vector<std::pair<int,int>> out;
    if (query.empty()) return out;
    size_t pos=0;
    std::string lower = text;
    std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
    std::string qlow = query;
    std::transform(qlow.begin(), qlow.end(), qlow.begin(), ::tolower);
    while (pos + qlow.size() <= lower.size() && out.size() < 500) {
        int idx = bmh_search(lower.substr(pos), qlow);
        if (idx==-1) break;
        pos += idx;
        out.emplace_back((int)pos, (int)qlow.size());
        pos += qlow.size();
    }
    return out;
}

PYBIND11_MODULE(veloce_search, m) {
    m.doc() = "VelocePDF fast search (C++ BMH, inspired by SumatraPDF TextSearch.cpp)";
    m.def("bmh_search", &bmh_search, "BMH single search");
    m.def("find_all", &find_all, "Find all matches bounded to 500");
}
