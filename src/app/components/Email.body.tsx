import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
// import TextStyle from "@tiptap/extension-text-style";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Heading2,
  Code2,
  Quote,
  Link as LinkIcon,
  RotateCcw,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";

const CustomTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      fontSize: {
        default: null,
        parseHTML: element => element.style.fontSize,
        renderHTML: attributes => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}` };
        },
      },
    };
  },
});


export function EmailBodyEditor({ value, onChange }: { value: string; onChange: (content: string) => void }) {
const editor = useEditor({
  extensions: [
    StarterKit,
    Underline,
    Link.configure({ openOnClick: false }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    CustomTextStyle,
    Color,
    FontFamily.configure({
      types: ["textStyle"],
    }),
  ],
  content: value,
  onUpdate: ({ editor }) => {
    onChange(editor.getHTML());
  },
  immediatelyRender: false,
});

  if (!editor) {
    return null;
  }

  return (
    <div className="border border-slate-600 rounded overflow-hidden">
      {/* Toolbar */}
      <div className="bg-slate-600 p-2 flex flex-wrap gap-1 border-b border-slate-600">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          className={`p-2 rounded transition-colors ${editor.isActive('bold') ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          title="Bold"
        >
          <Bold size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          className={`p-2 rounded transition-colors ${editor.isActive('italic') ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          title="Italic"
        >
          <Italic size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          disabled={!editor.can().chain().focus().toggleUnderline().run()}
          className={`p-2 rounded transition-colors ${editor.isActive('underline') ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          title="Underline"
        >
          <UnderlineIcon size={16} />
        </button>
        <div className="border-l border-slate-500 mx-1" />
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-2 rounded transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          title="Heading"
        >
          <Heading2 size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-2 rounded transition-colors ${editor.isActive('bulletList') ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          title="Bullet List"
        >
          <List size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-2 rounded transition-colors ${editor.isActive('orderedList') ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          title="Ordered List"
        >
          <ListOrdered size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`p-2 rounded transition-colors ${editor.isActive('blockquote') ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          title="Blockquote"
        >
          <Quote size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={`p-2 rounded transition-colors ${editor.isActive('codeBlock') ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          title="Code Block"
        >
          <Code2 size={16} />
        </button>
        <div className="border-l border-slate-500 mx-1" />
        <button
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          className={`p-2 rounded transition-colors ${editor.isActive({ textAlign: 'left' }) ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          title="Align Left"
        >
          <AlignLeft size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          className={`p-2 rounded transition-colors ${editor.isActive({ textAlign: 'center' }) ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          title="Align Center"
        >
          <AlignCenter size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          className={`p-2 rounded transition-colors ${editor.isActive({ textAlign: 'right' }) ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          title="Align Right"
        >
          <AlignRight size={16} />
        </button>
        <div className="border-l border-slate-500 mx-1" />
        <button
          onClick={() => editor.chain().focus().setLink({ href: prompt('Enter URL:') || '' }).run()}
          className={`p-2 rounded transition-colors bg-slate-700 text-slate-300 hover:bg-slate-600`}
          title="Add Link"
        >
          <LinkIcon size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().unsetAllMarks().run()}
          className="p-2 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
          title="Clear Formatting"
        >
          <RotateCcw size={16} />
        </button>
        <select
  value={editor.getAttributes("textStyle").fontFamily || ""}
  onChange={(e) =>
    editor.chain().focus().setFontFamily(e.target.value).run()
  }
  className="px-2 py-1 bg-slate-700 text-slate-200 rounded text-xs"
>
  <option value="">Default</option>
  <option value="Arial">Arial</option>
  <option value="Helvetica">Helvetica</option>
  <option value="Times New Roman">Times New Roman</option>
  <option value="Georgia">Georgia</option>
  <option value="Courier New">Courier New</option>
</select>

<select
  onChange={(e) =>
    editor
      .chain()
      .focus()
      .setMark("textStyle", { fontSize: e.target.value })
      .run()
  }
  className="px-2 py-1 bg-slate-700 text-slate-200 rounded text-xs"
>
  <option value="">Size</option>
  <option value="12px">12</option>
  <option value="14px">14</option>
  <option value="16px">16</option>
  <option value="18px">18</option>
  <option value="24px">24</option>
</select>

<input
  type="color"
  value={editor.getAttributes("textStyle").color || "#ffffff"}
  onChange={(e) =>
    editor.chain().focus().setColor(e.target.value).run()
  }
  className="w-8 h-8 p-0 bg-transparent cursor-pointer"
/>

      </div>

      {/* Editor Content */}
      <div className="bg-slate-700 text-white p-3 min-h-48 prose prose-invert max-w-none focus:outline-none">
        <EditorContent
          editor={editor}
          className="prose prose-invert max-w-none [&>*]:text-white [&_p]:text-white [&_h1]:text-white [&_h2]:text-white [&_h3]:text-white [&_ul]:text-white [&_ol]:text-white [&_li]:text-white [&_blockquote]:text-white [&_code]:text-white [&_pre]:bg-slate-800 [&_a]:text-blue-400"
        />
      </div>
    </div>
  );
}