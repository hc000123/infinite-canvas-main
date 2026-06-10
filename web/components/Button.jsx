export default function Button({ children = "Tailwind 按钮", ...props }) {
    return (
        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" type="button" {...props}>
            {children}
        </button>
    );
}
