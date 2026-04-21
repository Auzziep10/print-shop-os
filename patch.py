import re

with open('src/pages/Inventory/PalletsTab.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = """<div className="flex items-start justify-between">
                                                    <div>
                                                        <h4 className="font-serif text-lg leading-tight text-brand-primary">{item.name}</h4>"""

replacement = """{editingItemId === item.id ? (
                                                    <div className="flex flex-col gap-2 p-3 bg-brand-bg rounded-lg border border-brand-border">
                                                        <input type="text" value={editItemForm.name} onChange={e => setEditItemForm({...editItemForm, name: e.target.value})} className="w-full text-xs font-semibold p-2 bg-white border border-brand-border rounded outline-none focus:border-brand-primary" placeholder="Item Name" autoFocus onKeyDown={e => e.key === 'Enter' && handleUpdateItemDetails(activePallet.id, activeBox.id, item.id)} />
                                                        <div className="flex gap-2">
                                                            <input type="text" value={editItemForm.sku} onChange={e => setEditItemForm({...editItemForm, sku: e.target.value})} className="w-1/2 text-[10px] p-2 bg-white border border-brand-border rounded outline-none uppercase focus:border-brand-primary" placeholder="SKU (Opt)" onKeyDown={e => e.key === 'Enter' && handleUpdateItemDetails(activePallet.id, activeBox.id, item.id)} />
                                                            <input type="text" value={editItemForm.size} onChange={e => setEditItemForm({...editItemForm, size: e.target.value})} className="w-1/2 text-[10px] p-2 bg-white border border-brand-border rounded outline-none uppercase focus:border-brand-primary" placeholder="Size (Opt)" onKeyDown={e => e.key === 'Enter' && handleUpdateItemDetails(activePallet.id, activeBox.id, item.id)} />
                                                        </div>
                                                        <div className="flex gap-2 justify-end mt-1">
                                                            <button onClick={() => setEditingItemId(null)} className="text-[10px] font-bold uppercase text-brand-secondary hover:text-black transition-colors px-3">Cancel</button>
                                                            <button onClick={() => handleUpdateItemDetails(activePallet.id, activeBox.id, item.id)} className="text-[10px] font-bold uppercase bg-brand-primary text-white hover:bg-black transition-colors rounded-lg px-4 py-2">Save</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                <div className="flex items-start justify-between cursor-pointer group/item" onClick={() => { setEditingItemId(item.id); setEditItemForm({ name: item.name, sku: item.sku || '', size: item.size || '' }); }} title="Click to edit item">
                                                    <div>
                                                        <h4 className="font-serif text-lg leading-tight text-brand-primary group-hover/item:opacity-70 transition-opacity">{item.name}</h4>"""

content = content.replace(target, replacement)

target_right = """<div className="text-right flex items-center gap-2 pr-4">"""
replacement_right = """<div className="text-right flex items-center gap-2 pr-4 cursor-auto" onClick={e => e.stopPropagation()}>"""
content = content.replace(target_right, replacement_right)

target_end = """<X size={16} />
                                                        </button>
                                                    </div>
                                                </div>"""

replacement_end = """<X size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                                )}"""
content = content.replace(target_end, replacement_end)

with open('src/pages/Inventory/PalletsTab.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
