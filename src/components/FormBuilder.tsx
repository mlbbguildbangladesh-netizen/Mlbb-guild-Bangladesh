import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash, Settings, Save, AlertCircle } from 'lucide-react';
import { AppSetting, FormFieldSetting } from '../types';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import toast from 'react-hot-toast';

const DEFAULT_FIELDS: FormFieldSetting[] = [
  { id: 'logoUrl', label: 'Team Logo Upload', type: 'image', required: false, enabled: true, isCustom: false },
  { id: 'leaderCardUrl', label: 'Leader NID/Card', type: 'image', required: true, enabled: true, isCustom: false },
];

export const FormBuilder: React.FC = () => {
  const [fields, setFields] = useState<FormFieldSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'global'));
        if (snap.exists() && snap.data().formFields) {
          setFields(snap.data().formFields);
        } else {
          setFields(DEFAULT_FIELDS);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'global'), { formFields: fields }, { merge: true });
      toast.success('Form settings saved successfully!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const addCustomField = () => {
    const newField: FormFieldSetting = {
      id: `custom_${Date.now()}`,
      label: 'New Custom Field',
      type: 'text',
      required: false,
      enabled: true,
      isCustom: true
    };
    setFields([...fields, newField]);
  };

  const removeField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
  };

  const updateField = (id: string, updates: Partial<FormFieldSetting>) => {
    setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  if (loading) return <div className="p-10 text-center">Loading form builder...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black italic tracking-tight">REGISTRATION <span className="text-neon-blue">FORM BUILDER</span></h2>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Customize what teams need to provide when registering</p>
        </div>
        <div className="flex gap-4">
          <button onClick={addCustomField} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border border-white/10">
            <Plus size={14} /> ADD FIELD
          </button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-neon-blue text-black rounded-lg text-xs font-bold transition-all flex items-center gap-2 hover:brightness-110 disabled:opacity-50">
            <Save size={14} /> {saving ? 'SAVING...' : 'SAVE CHANGES'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {fields.map((field, index) => (
          <motion.div 
            key={field.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 border rounded-xl flex items-start justify-between gap-4 transition-all ${field.enabled ? 'bg-white/5 border-white/10' : 'bg-black/40 border-white/5 opacity-60'}`}
          >
            <div className="flex-1 space-y-4">
              <div className="flex gap-4">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Field Label</label>
                  <input 
                    disabled={!field.isCustom && !['logoUrl', 'leaderCardUrl'].includes(field.id)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-neon-blue outline-none disabled:opacity-50"
                    value={field.label}
                    onChange={e => updateField(field.id, { label: e.target.value })}
                  />
                  {!field.isCustom && <p className="text-[9px] text-neon-blue">System Field</p>}
                </div>

                <div className="w-32 space-y-1">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Type</label>
                  <select 
                    disabled={!field.isCustom}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-neon-blue outline-none disabled:opacity-50"
                    value={field.type}
                    onChange={e => updateField(field.id, { type: e.target.value as any })}
                  >
                    <option value="text">Text / String</option>
                    <option value="number">Number</option>
                    <option value="url">Link / URL</option>
                    <option value="email">Email</option>
                    <option value="image">Image Upload</option>
                    <option value="file">File Upload</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="accent-neon-blue"
                    checked={field.enabled} 
                    onChange={e => updateField(field.id, { enabled: e.target.checked })} 
                  />
                  <span className="text-xs font-bold text-gray-300">Enabled</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="accent-neon-blue"
                    checked={field.required} 
                    onChange={e => updateField(field.id, { required: e.target.checked })} 
                  />
                  <span className="text-xs font-bold text-gray-300">Required</span>
                </label>
              </div>
            </div>

            {field.isCustom && (
              <button 
                onClick={() => removeField(field.id)}
                className="p-2 text-gray-500 hover:text-neon-red hover:bg-neon-red/10 rounded-lg transition-all"
              >
                <Trash size={16} />
              </button>
            )}
          </motion.div>
        ))}

        {fields.length === 0 && (
          <div className="p-10 border border-dashed border-white/10 rounded-xl text-center text-gray-500 text-sm">
            No dynamic fields configured.
          </div>
        )}
      </div>
    </div>
  );
};
