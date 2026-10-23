package tree_sitter_cython_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_cython "github.com/ncbm/tree-sitter-cython/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_cython.Language())
	if language == nil {
		t.Errorf("Error loading Cython grammar")
	}
}
