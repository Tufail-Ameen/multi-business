import { faGripVertical } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRef, useState } from "react";

export default function CategorySwapList({ names, onMoveTo, disabled = false }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const dragIndexRef = useRef(null);

  if (!names || names.length < 2) return null;

  const clearDrag = () => {
    dragIndexRef.current = null;
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className="category-swap-list">
      <p className="form-label input-clr mb-2">Drag a row to swap</p>
      <ul className="category-swap-rows">
        {names.map((name, index) => (
          <li
            key={name}
            className={`category-swap-row${dragIndex === index ? " is-dragging" : ""}${
              overIndex === index && dragIndex !== index ? " is-drop-target" : ""
            }`}
            draggable={!disabled}
            onDragStart={(event) => {
              if (disabled) return;
              dragIndexRef.current = index;
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", String(index));
              setDragIndex(index);
            }}
            onDragOver={(event) => {
              if (disabled) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              if (overIndex !== index) setOverIndex(index);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (disabled) return;
              const fromData = Number(event.dataTransfer.getData("text/plain"));
              const from = Number.isInteger(fromData) ? fromData : dragIndexRef.current;
              if (from != null && from >= 0) onMoveTo?.(from, index);
              clearDrag();
            }}
            onDragEnd={clearDrag}
          >
            <FontAwesomeIcon icon={faGripVertical} className="category-swap-grip" />
            <span className="category-swap-name">{name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
