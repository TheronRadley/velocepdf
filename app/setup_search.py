from pybind11.setup_helpers import Pybind11Extension, build_ext
from setuptools import setup

ext_modules = [
    Pybind11Extension(
        "veloce_search",
        ["core/search_index.cpp"],
        cxx_std=17,
    ),
]

setup(
    name="veloce_search",
    ext_modules=ext_modules,
    cmdclass={"build_ext": build_ext},
)
