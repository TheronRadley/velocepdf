CXX=g++
CXXFLAGS=-O2 -std=c++17 -Wall -Wextra -fPIE
TARGET=veloce-pdfinfo

all: $(TARGET)

$(TARGET): pdfinfo.cpp
	$(CXX) $(CXXFLAGS) $< -o $@

clean:
	rm -f $(TARGET)

# Assembly demo — blend.asm (NASM or gas)
# nasm -f elf64 ../core/blend.asm -o blend.o
# ar rcs libveloceblend.a blend.o

